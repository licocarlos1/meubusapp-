import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getEvolutionConfig() {
  const { rows } = await pool.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('evolution_url','evolution_apikey','evolution_instance')"
  );
  const cfg = {};
  rows.forEach((r) => (cfg[r.chave] = r.valor));
  return cfg;
}

// Normaliza para dígitos com DDI. Brasil: DDD+numero (10/11) -> prefixa 55.
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

async function sendWhatsApp(cfg, telefone, text) {
  const base = cfg.evolution_url.replace(/\/+$/, '');
  const url = `${base}/message/sendText/${cfg.evolution_instance}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.evolution_apikey },
    body: JSON.stringify({ number: telefone, text }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Evolution ${resp.status}: ${t.slice(0, 200)}`);
  }
}

// ── Admin: configuração da Evolution ──────────────────────────────────────────

// Retorna a config com a apikey MASCARADA (nunca expõe a chave)
router.get('/config', requireAuth, async (_req, res) => {
  try {
    const cfg = await getEvolutionConfig();
    res.json({
      evolution_url: cfg.evolution_url || '',
      evolution_instance: cfg.evolution_instance || '',
      apikey_set: !!(cfg.evolution_apikey && cfg.evolution_apikey.length),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Salva a config. A apikey só é atualizada se vier preenchida (não apaga ao editar).
router.post('/config', requireAuth, async (req, res) => {
  try {
    const { evolution_url, evolution_instance, evolution_apikey } = req.body;
    const upserts = [
      ['evolution_url', evolution_url ?? ''],
      ['evolution_instance', evolution_instance ?? ''],
    ];
    if (evolution_apikey) upserts.push(['evolution_apikey', evolution_apikey]);
    for (const [k, v] of upserts) {
      await pool.query(
        'INSERT INTO configuracoes (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor',
        [k, v]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fluxo do usuário: enviar código e verificar ───────────────────────────────

router.post('/send-code', async (req, res) => {
  try {
    const telefone = normalizePhone(req.body.telefone);
    if (telefone.length < 12) {
      return res.status(400).json({ error: 'Número inválido. Informe DDD + número.' });
    }

    const cfg = await getEvolutionConfig();
    if (!cfg.evolution_url || !cfg.evolution_apikey || !cfg.evolution_instance) {
      return res.status(503).json({ error: 'Recuperação por WhatsApp ainda não foi configurada.' });
    }

    // Rate limit: 1 envio por minuto por número
    const { rows: ex } = await pool.query('SELECT criado_em FROM whatsapp_codigos WHERE telefone=$1', [telefone]);
    if (ex.length && Date.now() - new Date(ex[0].criado_em).getTime() < 60000) {
      return res.status(429).json({ error: 'Aguarde 1 minuto para pedir outro código.' });
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query(
      `INSERT INTO whatsapp_codigos (telefone, codigo, expira_em, tentativas, criado_em)
       VALUES ($1, $2, now() + interval '10 minutes', 0, now())
       ON CONFLICT (telefone) DO UPDATE
         SET codigo=EXCLUDED.codigo, expira_em=EXCLUDED.expira_em, tentativas=0, criado_em=now()`,
      [telefone, codigo]
    );

    await sendWhatsApp(cfg, telefone, `MeuBusApp: seu código de verificação é ${codigo}. Válido por 10 minutos.`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp/send-code]', e.message);
    res.status(502).json({ error: 'Não foi possível enviar o WhatsApp. Tente novamente.' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const telefone = normalizePhone(req.body.telefone);
    const codigo = String(req.body.codigo || '').trim();
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Dispositivo não identificado.' });

    const { rows } = await pool.query('SELECT * FROM whatsapp_codigos WHERE telefone=$1', [telefone]);
    if (!rows.length) return res.status(400).json({ error: 'Solicite um código primeiro.' });

    const rec = rows[0];
    if (new Date(rec.expira_em) < new Date()) return res.status(400).json({ error: 'Código expirado. Peça outro.' });
    if (rec.tentativas >= 5) return res.status(429).json({ error: 'Muitas tentativas. Peça um novo código.' });
    if (rec.codigo !== codigo) {
      await pool.query('UPDATE whatsapp_codigos SET tentativas = tentativas + 1 WHERE telefone=$1', [telefone]);
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    // Código válido — consome
    await pool.query('DELETE FROM whatsapp_codigos WHERE telefone=$1', [telefone]);

    // Número já vinculado a um perfil? → RECUPERAÇÃO
    const { rows: linked } = await pool.query('SELECT id FROM perfis WHERE telefone=$1 LIMIT 1', [telefone]);
    if (linked.length) {
      return res.json({ ok: true, action: 'recovered', deviceId: linked[0].id });
    }

    // Não vinculado → VINCULA o dispositivo atual a este número
    await pool.query(
      `INSERT INTO perfis (id, pontos, telefone) VALUES ($1, 0, $2)
       ON CONFLICT (id) DO UPDATE SET telefone = EXCLUDED.telefone`,
      [deviceId, telefone]
    );
    res.json({ ok: true, action: 'linked', deviceId });
  } catch (e) {
    console.error('[whatsapp/verify-code]', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
