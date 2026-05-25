-- ============================================================================
-- MeuBusApp — Recuperação de conta por WhatsApp (Evolution API)
-- Aplicar no banco já existente:
--   cat whatsapp_setup.sql | docker exec -i <PG> psql -U postgres -d setebus
-- ============================================================================

-- Telefone vinculado ao perfil (para recuperação de saldo em outro aparelho)
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS telefone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_telefone
  ON perfis (telefone) WHERE telefone IS NOT NULL;

-- Códigos de verificação enviados por WhatsApp (1 por número, sobrescreve)
CREATE TABLE IF NOT EXISTS whatsapp_codigos (
  telefone   TEXT PRIMARY KEY,
  codigo     TEXT NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ DEFAULT now()
);

-- Configurações da Evolution API (preenchidas pelo admin em Configurações)
INSERT INTO configuracoes (chave, valor) VALUES
  ('evolution_url', ''),
  ('evolution_apikey', ''),
  ('evolution_instance', '')
ON CONFLICT (chave) DO NOTHING;
