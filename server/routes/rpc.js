import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// Maps RPC name → ordered list of parameter names (matching the PG function signature)
const RPC_PARAMS = {
  atualizar_streak: ['p_device_id'],
  adicionar_pontos: ['p_device_id', 'p_pontos'],
  processar_referral: ['p_device_id', 'p_referral_code'],
  atribuir_pontos_viagem: ['p_device_id', 'p_pontos_base'],
  resgatar_brinde: ['p_device_id', 'p_pontos', 'p_loja_nome', 'p_codigo'],
  cancelar_resgate: ['p_resgate_id', 'p_device_id'],
  validar_cupom_lojista: ['p_codigo', 'p_loja_id'],
  limpar_cupons_expirados: [],
  limpar_sessoes_orfas: [],
  finalizar_transmissao: ['p_sessao_id', 'p_fim_em', 'p_pontos'],
  heartbeat_transmissao: ['p_sessao_id'],
  verificar_perfil_existe: ['p_device_id'],
  verificar_posicao_na_rota: ['p_linha_nome', 'p_lat', 'p_lng'],
  increment_anuncio_evento: ['p_anuncio_id', 'p_tipo_evento'],
  remover_posicao_beacon: ['p_device_id'],
};

router.post('/:name', async (req, res) => {
  const { name } = req.params;
  const paramOrder = RPC_PARAMS[name];

  if (paramOrder === undefined) {
    return res.status(404).json({ error: `Função RPC '${name}' não encontrada` });
  }

  try {
    const values = paramOrder.map((p) => req.body[p]);
    const namedParams = paramOrder
      .map((p, i) => `${p} => $${i + 1}`)
      .join(', ');

    const sql = paramOrder.length === 0
      ? `SELECT * FROM "${name}"()`
      : `SELECT * FROM "${name}"(${namedParams})`;

    const result = await pool.query(sql, values);

    if (result.rows.length === 0) return res.json({ data: null });

    const row = result.rows[0];
    const keys = Object.keys(row);

    // Single scalar value — unwrap it
    if (keys.length === 1 && result.rows.length === 1) {
      return res.json({ data: row[keys[0]] });
    }

    // Single row with multiple columns
    if (result.rows.length === 1) {
      return res.json({ data: row });
    }

    return res.json({ data: result.rows });
  } catch (e) {
    console.error(`[rpc] ${name}:`, e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

export default router;
