import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// FK relationships: table -> { joinedTable -> { fk, refTable, refPk } }
const FK = {
  brindes: {
    lojas: { fk: 'loja_id', refTable: 'lojas', refPk: 'id' },
  },
  resgates: {
    lojas: { fk: 'loja_id', refTable: 'lojas', refPk: 'id' },
    perfis: { fk: 'perfil_id', refTable: 'perfis', refPk: 'id' },
  },
};

// Known primary/conflict columns for upsert
const CONFLICT_COLS = {
  onibus_posicoes: 'id',
  perfis: 'id',
  configuracoes: 'chave',
  historico_transmissoes: 'id',
};

// Parse Supabase-style select: '*, lojas(nome)' or '*, lojas(*)'
function parseSelect(table, selectStr) {
  const joins = [];
  const colParts = [];

  // Split by commas not inside parentheses
  const parts = selectStr.split(/,(?![^(]*\))/);

  for (const raw of parts) {
    const part = raw.trim();
    if (part === '*') {
      colParts.push(`"${table}".*`);
    } else if (part.includes('(')) {
      const joinTable = part.split('(')[0].trim();
      const inner = (part.match(/\(([^)]+)\)/) || [])[1] || '*';
      const rel = FK[table]?.[joinTable];
      if (rel) {
        joins.push(`LEFT JOIN "${joinTable}" ON "${table}"."${rel.fk}" = "${joinTable}"."${rel.refPk}"`);
        if (inner === '*') {
          colParts.push(`row_to_json("${joinTable}".*) AS "${joinTable}"`);
        } else {
          const jsonPairs = inner
            .split(',')
            .map((c) => c.trim())
            .map((c) => `'${c}', "${joinTable}"."${c}"`)
            .join(', ');
          colParts.push(`json_build_object(${jsonPairs}) AS "${joinTable}"`);
        }
      }
    } else {
      colParts.push(`"${table}"."${part}"`);
    }
  }

  return { colParts, joins };
}

// Parse Supabase or() expression: 'expira_em.is.null,expira_em.gt.2024-01-01T...'
function parseOrExpr(expr, params) {
  const clauses = expr.split(',').map((cond) => {
    const dotIdx = cond.indexOf('.');
    const col = cond.slice(0, dotIdx);
    const rest = cond.slice(dotIdx + 1);
    const opEnd = rest.indexOf('.');
    const op = opEnd === -1 ? rest : rest.slice(0, opEnd);
    const val = opEnd === -1 ? null : rest.slice(opEnd + 1);

    if (op === 'is' && (val === 'null' || !val)) {
      return `"${col}" IS NULL`;
    }
    if (op === 'gt') {
      params.push(val);
      return `"${col}" > $${params.length}`;
    }
    if (op === 'lt') {
      params.push(val);
      return `"${col}" < $${params.length}`;
    }
    if (op === 'eq') {
      params.push(val);
      return `"${col}" = $${params.length}`;
    }
    return '1=1';
  });
  return `(${clauses.join(' OR ')})`;
}

function buildWhere(table, filters, orExpr, params) {
  const clauses = [];

  for (const f of filters || []) {
    // Support dot notation for joined columns: "lojas.id"
    const colRef = f.col.includes('.')
      ? `"${f.col.split('.')[0]}"."${f.col.split('.')[1]}"`
      : `"${table}"."${f.col}"`;

    switch (f.op) {
      case 'eq':
        params.push(f.val);
        clauses.push(`${colRef} = $${params.length}`);
        break;
      case 'is':
        clauses.push(
          f.val === null || f.val === 'null'
            ? `${colRef} IS NULL`
            : `${colRef} IS NOT NULL`
        );
        break;
      case 'lt':
        params.push(f.val);
        clauses.push(`${colRef} < $${params.length}`);
        break;
      case 'lte':
        params.push(f.val);
        clauses.push(`${colRef} <= $${params.length}`);
        break;
      case 'gte':
        params.push(f.val);
        clauses.push(`${colRef} >= $${params.length}`);
        break;
      case 'ne':
        params.push(f.val);
        clauses.push(`${colRef} != $${params.length}`);
        break;
    }
  }

  if (orExpr) clauses.push(parseOrExpr(orExpr, params));

  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

router.post('/', async (req, res) => {
  const {
    table, operation, select, filters, orExpr,
    order, limit, data, single, maybeSingle, count, head,
  } = req.body;

  if (!table) return res.status(400).json({ error: 'table é obrigatório' });

  const op = operation || 'select';

  try {
    const params = [];

    // ── SELECT ────────────────────────────────────────────────────
    if (op === 'select') {
      const { colParts, joins } = parseSelect(table, select || '*');
      const joinSql = joins.join(' ');
      const whereSql = buildWhere(table, filters, orExpr, params);

      // Count-only
      if (head || count === 'exact') {
        const sql = `SELECT COUNT(*) FROM "${table}" ${joinSql} ${whereSql}`;
        const result = await pool.query(sql, params);
        return res.json({ data: null, count: parseInt(result.rows[0].count, 10) });
      }

      const orderSql = order
        ? `ORDER BY "${table}"."${order.col}" ${order.ascending !== false ? 'ASC' : 'DESC'}`
        : '';
      const limitSql = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

      const sql = `SELECT ${colParts.join(', ')} FROM "${table}" ${joinSql} ${whereSql} ${orderSql} ${limitSql}`;
      const result = await pool.query(sql, params);

      // Nunca expor a apikey da Evolution via a API genérica de leitura
      if (table === 'configuracoes') {
        result.rows.forEach((r) => {
          if (r && r.chave === 'evolution_apikey') r.valor = '';
        });
      }

      if (single || maybeSingle) {
        if (result.rows.length === 0) {
          return res.json({ data: null, error: single ? { code: 'PGRST116' } : null });
        }
        return res.json({ data: result.rows[0] });
      }

      return res.json({ data: result.rows });
    }

    // ── INSERT ────────────────────────────────────────────────────
    if (op === 'insert') {
      const rows = Array.isArray(data) ? data : [data];
      const allResults = [];

      for (const row of rows) {
        const p = [];
        const cols = Object.keys(row).filter((k) => row[k] !== undefined);
        const vals = cols.map((c) => { p.push(row[c]); return `$${p.length}`; });
        const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`;
        const r = await pool.query(sql, p);
        allResults.push(...r.rows);
      }

      return res.json({ data: single || maybeSingle ? allResults[0] : allResults });
    }

    // ── UPDATE ────────────────────────────────────────────────────
    if (op === 'update') {
      const setCols = Object.keys(data).filter((k) => data[k] !== undefined);
      const setClauses = setCols.map((c) => {
        params.push(data[c]);
        return `"${c}" = $${params.length}`;
      });
      const whereSql = buildWhere(table, filters, orExpr, params);
      const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} ${whereSql} RETURNING *`;
      const result = await pool.query(sql, params);
      return res.json({ data: result.rows });
    }

    // ── DELETE ────────────────────────────────────────────────────
    if (op === 'delete') {
      const whereSql = buildWhere(table, filters, orExpr, params);
      const sql = `DELETE FROM "${table}" ${whereSql} RETURNING *`;
      const result = await pool.query(sql, params);
      return res.json({ data: result.rows });
    }

    // ── UPSERT ────────────────────────────────────────────────────
    if (op === 'upsert') {
      const rows = Array.isArray(data) ? data : [data];
      const allResults = [];
      const conflictCol = CONFLICT_COLS[table] || 'id';

      for (const row of rows) {
        const p = [];
        const cols = Object.keys(row).filter((k) => row[k] !== undefined);
        const vals = cols.map((c) => { p.push(row[c]); return `$${p.length}`; });
        const updateSet = cols
          .filter((c) => c !== conflictCol)
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');

        let sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')})`;
        if (updateSet) {
          sql += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet}, ultima_atualizacao = now()`;
        } else {
          sql += ` ON CONFLICT ("${conflictCol}") DO NOTHING`;
        }
        // Remove the timestamp update if the table doesn't have that column
        if (!['onibus_posicoes'].includes(table)) {
          sql = sql.replace(', ultima_atualizacao = now()', '');
        }
        sql += ' RETURNING *';

        const r = await pool.query(sql, p);
        if (r.rows[0]) allResults.push(r.rows[0]);
      }

      return res.json({ data: allResults });
    }

    res.status(400).json({ error: `Operação desconhecida: ${op}` });
  } catch (e) {
    console.error(`[data] ${op} ${table}:`, e.message);
    // e.code = SQLSTATE do PostgreSQL (ex: 23505 unique_violation) — o frontend usa isso
    res.status(500).json({ error: e.message, code: e.code });
  }
});

export default router;
