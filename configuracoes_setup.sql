-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- Configuração padrão: pontos ativados
INSERT INTO configuracoes (chave, valor)
VALUES ('pontos_ativados', 'true')
ON CONFLICT (chave) DO NOTHING;

-- Adicionar trigger para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION atualizar_configuracao_ts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_configuracao_ts ON configuracoes;
CREATE TRIGGER trg_configuracao_ts
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_configuracao_ts();
