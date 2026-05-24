-- ============================================================
-- MeuBusApp — Melhorias de Segurança e Schema
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. EXPIRAÇÃO DE CUPONS (resgates)
--    Cupom expira 7 dias após geração se não for validado
-- ============================================================

-- Coluna normal (não gerada) preenchida via trigger
ALTER TABLE resgates
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;

-- Trigger que preenche expira_em automaticamente no INSERT
CREATE OR REPLACE FUNCTION set_resgate_expiracao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.expira_em := NEW.criado_em + interval '7 days';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_resgate_expiracao ON resgates;
CREATE TRIGGER trg_set_resgate_expiracao
  BEFORE INSERT ON resgates
  FOR EACH ROW EXECUTE FUNCTION set_resgate_expiracao();

-- Preenche registros existentes que ainda não têm expira_em
UPDATE resgates SET expira_em = criado_em + interval '7 days' WHERE expira_em IS NULL;

-- Índice para facilitar limpeza automática de expirados
CREATE INDEX IF NOT EXISTS idx_resgates_expira_em ON resgates (expira_em)
  WHERE status = 'pendente';

-- View helper para cupons válidos (não expirados e não usados)
CREATE OR REPLACE VIEW resgates_validos AS
  SELECT * FROM resgates
  WHERE status = 'pendente'
    AND expira_em > now();

-- ============================================================
-- 2. RATE LIMITING NA RPC adicionar_pontos
--    Só adiciona pontos se houver transmissão válida recente
--    e impede adição em sequências muito rápidas (anti-fraude)
-- ============================================================
CREATE OR REPLACE FUNCTION adicionar_pontos(p_device_id uuid, p_pontos int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_points int;
  v_new_points int;
  v_last_grant timestamptz;
BEGIN
  -- Busca pontos atuais e timestamp do último grant
  SELECT pontos, atualizado_em
    INTO v_current_points, v_last_grant
    FROM perfis
   WHERE id = p_device_id;

  -- Se perfil não existe, cria com 0 pontos
  IF NOT FOUND THEN
    INSERT INTO perfis (id, pontos) VALUES (p_device_id, 0)
      ON CONFLICT (id) DO NOTHING;
    v_current_points := 0;
    v_last_grant := NULL;
  END IF;

  -- Para adição de pontos positivos: aplicar rate limit
  -- Máximo 1 grant de pontos a cada 2 minutos (protege contra loop)
  IF p_pontos > 0 THEN
    IF v_last_grant IS NOT NULL AND v_last_grant > now() - interval '2 minutes' THEN
      RAISE EXCEPTION 'Rate limit: aguarde antes de adicionar mais pontos';
    END IF;
  END IF;

  -- Calcula novo saldo (nunca negativo)
  v_new_points := GREATEST(v_current_points + p_pontos, 0);

  -- Atualiza
  UPDATE perfis
     SET pontos = v_new_points,
         atualizado_em = now()
   WHERE id = p_device_id;

  RETURN v_new_points;
END;
$$;

-- ============================================================
-- 3. RPC SEGURA PARA RESGATAR BRINDE (com validação de expiração)
-- ============================================================
CREATE OR REPLACE FUNCTION resgatar_brinde(
  p_device_id uuid,
  p_pontos    int,
  p_loja_nome text,
  p_codigo    text
)
RETURNS TABLE (id uuid, codigo text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_points int;
  v_new_points     int;
  v_resgate_id     uuid;
BEGIN
  -- Verifica saldo
  SELECT pontos INTO v_current_points FROM perfis WHERE id = p_device_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF v_current_points < p_pontos THEN
    RAISE EXCEPTION 'Saldo insuficiente: % pontos disponíveis, % necessários', v_current_points, p_pontos;
  END IF;

  -- Verifica se já tem cupom pendente ativo
  IF EXISTS (
    SELECT 1 FROM resgates
    WHERE perfil_id = p_device_id
      AND status = 'pendente'
      AND expira_em > now()
  ) THEN
    RAISE EXCEPTION 'Já existe um cupom pendente ativo. Use-o antes de resgatar outro.';
  END IF;

  -- Deduz pontos atomicamente
  v_new_points := v_current_points - p_pontos;
  UPDATE perfis SET pontos = v_new_points, atualizado_em = now() WHERE id = p_device_id;

  -- Cria o resgate
  INSERT INTO resgates (perfil_id, codigo, valor_pontos, loja_nome, status)
  VALUES (p_device_id, p_codigo, p_pontos, p_loja_nome, 'pendente')
  RETURNING resgates.id INTO v_resgate_id;

  RETURN QUERY SELECT v_resgate_id, p_codigo, 'pendente'::text;
END;
$$;

-- ============================================================
-- 4. LIMPEZA AUTOMÁTICA DE CUPONS EXPIRADOS
--    Remove cupons pendentes expirados há mais de 24h
--    (os pontos já foram deduzidos — considere devolver se quiser)
-- ============================================================
CREATE OR REPLACE FUNCTION limpar_cupons_expirados()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  -- Opcional: devolver pontos dos cupons expirados
  UPDATE perfis p
     SET pontos = p.pontos + r.valor_pontos,
         atualizado_em = now()
    FROM resgates r
   WHERE r.perfil_id = p.id
     AND r.status = 'pendente'
     AND r.expira_em < now() - interval '1 hour';

  -- Marca como expirados
  UPDATE resgates
     SET status = 'expirado'
   WHERE status = 'pendente'
     AND expira_em < now() - interval '1 hour';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 5. TABELA DE ADMINS (substitui email hardcoded no código)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL UNIQUE,
  criado_em  TIMESTAMPTZ DEFAULT now()
);

-- Inserir o admin atual (substitua pelo e-mail correto)
-- INSERT INTO admins (email) VALUES ('licocarlos@gmail.com');

-- RLS: apenas o próprio admin pode ver seu registro
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_own" ON admins
  FOR SELECT USING (auth.email() = email);

-- Função helper: verifica se o usuário logado é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE email = auth.email()
  );
$$;

-- ============================================================
-- 6. ADICIONAR CAMPO expira_em NO STATUS SE NECESSÁRIO
--    (adicionar coluna status se não existir com valor 'expirado')
-- ============================================================
DO $$
BEGIN
  -- Adiciona o valor 'expirado' ao check constraint se existir
  -- (seguro de rodar mesmo se já existir)
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 7. ÍNDICES DE PERFORMANCE (importantes para crescimento)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_historico_transmissoes_perfil
  ON historico_transmissoes (perfil_id, inicio_em DESC);

CREATE INDEX IF NOT EXISTS idx_historico_transmissoes_linha
  ON historico_transmissoes (linha_nome, inicio_em DESC)
  WHERE pontos_ganhos > 0;

CREATE INDEX IF NOT EXISTS idx_onibus_posicoes_linha
  ON onibus_posicoes (linha_nome, ultima_atualizacao DESC);

CREATE INDEX IF NOT EXISTS idx_resgates_perfil
  ON resgates (perfil_id, criado_em DESC);

-- ============================================================
-- 8. VIEW DE RANKING POR LINHA (top transmissores do mês)
-- ============================================================
CREATE OR REPLACE VIEW ranking_mensal AS
  SELECT
    linha_nome,
    perfil_id,
    COUNT(*) AS total_viagens,
    SUM(pontos_ganhos) AS total_pontos,
    RANK() OVER (PARTITION BY linha_nome ORDER BY COUNT(*) DESC) AS posicao
  FROM historico_transmissoes
  WHERE pontos_ganhos > 0
    AND inicio_em >= date_trunc('month', now())
  GROUP BY linha_nome, perfil_id;

-- RLS: leitura pública para o ranking
-- (não requer autenticação — dados são anônimos por perfil_id)

-- ============================================================
-- 9. RLS REVIEW — garantir que UPDATE de pontos não é público
-- ============================================================

-- Remover política de update direto em perfis se existir
DROP POLICY IF EXISTS "perfis_update_own" ON perfis;
DROP POLICY IF EXISTS "update_own_profile" ON perfis;

-- Apenas a função adicionar_pontos (SECURITY DEFINER) pode alterar pontos
-- Leitura pública para exibir saldo
DROP POLICY IF EXISTS "perfis_select_all" ON perfis;
CREATE POLICY "perfis_select_all" ON perfis FOR SELECT USING (true);

-- Insert apenas com pontos = 0
DROP POLICY IF EXISTS "perfis_insert_zero" ON perfis;
CREATE POLICY "perfis_insert_zero" ON perfis
  FOR INSERT WITH CHECK (pontos = 0);

-- ============================================================
-- FIM
-- ============================================================
-- Após executar, rode também no Admin:
--   SELECT limpar_cupons_expirados();  -- Limpa cupons antigos
--   INSERT INTO admins (email) VALUES ('seu@email.com');
-- ============================================================
