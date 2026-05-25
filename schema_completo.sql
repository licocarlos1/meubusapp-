-- ============================================================================
-- MeuBusApp — Schema completo para PostgreSQL próprio (sem Supabase)
-- ----------------------------------------------------------------------------
-- Execute UMA VEZ num banco vazio:
--   psql -U postgres -d postgres -f schema_completo.sql
--
-- Não inclui RLS, auth.users nem GRANT para anon/authenticated — essas eram
-- features do Supabase. A segurança agora é feita pelo backend Express (JWT).
-- Todas as funções abaixo já existiam no Supabase; foram apenas consolidadas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- Perfis de usuário (id = device id gerado no cliente, formato UUID)
CREATE TABLE IF NOT EXISTS perfis (
  id                     UUID PRIMARY KEY,
  pontos                 INTEGER NOT NULL DEFAULT 0,
  referral_code          TEXT,
  referral_processado    BOOLEAN NOT NULL DEFAULT FALSE,
  streak_atual           INTEGER NOT NULL DEFAULT 0,
  ultimo_dia_transmissao DATE,
  ultima_adicao_pontos   TIMESTAMPTZ,
  telefone               TEXT,
  atualizado_em          TIMESTAMPTZ DEFAULT now(),
  criado_em              TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_referral_code ON perfis (referral_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_telefone ON perfis (telefone) WHERE telefone IS NOT NULL;

-- Códigos de verificação WhatsApp (recuperação de conta)
CREATE TABLE IF NOT EXISTS whatsapp_codigos (
  telefone   TEXT PRIMARY KEY,
  codigo     TEXT NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ DEFAULT now()
);

-- Lojas / estabelecimentos parceiros
CREATE TABLE IF NOT EXISTS lojas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  latitude  DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Brindes / recompensas
CREATE TABLE IF NOT EXISTS brindes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id             UUID REFERENCES lojas(id) ON DELETE CASCADE,
  nome_brinde         TEXT NOT NULL,
  pontos_necessarios  INTEGER NOT NULL DEFAULT 1000,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ DEFAULT now()
);

-- Linhas de ônibus
CREATE TABLE IF NOT EXISTS linhas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL UNIQUE,
  validar_rota BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em    TIMESTAMPTZ DEFAULT now()
);

-- Anúncios / banners
CREATE TABLE IF NOT EXISTS anuncios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT,
  imagem_url    TEXT,
  link_clique   TEXT,
  data_inicio   DATE,
  data_fim      DATE,
  posicao       TEXT DEFAULT 'top',
  clicks        INTEGER DEFAULT 0,
  visualizacoes INTEGER DEFAULT 0,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

-- Histórico de eventos de anúncios (analytics detalhado)
CREATE TABLE IF NOT EXISTS anuncios_eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anuncio_id  UUID REFERENCES anuncios(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('click', 'view')),
  criado_em   TIMESTAMPTZ DEFAULT now(),
  user_agent  TEXT,
  ip_address  INET
);

-- Resgates / cupons
CREATE TABLE IF NOT EXISTS resgates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id    UUID REFERENCES perfis(id) ON DELETE CASCADE,
  loja_id      UUID REFERENCES lojas(id) ON DELETE SET NULL,
  codigo       TEXT NOT NULL,
  valor_pontos INTEGER NOT NULL,
  loja_nome    TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente',
  criado_em    TIMESTAMPTZ DEFAULT now(),
  expira_em    TIMESTAMPTZ,
  validado_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_resgates_perfil        ON resgates (perfil_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_resgates_perfil_status ON resgates (perfil_id, status);
CREATE INDEX IF NOT EXISTS idx_resgates_expira_em     ON resgates (expira_em) WHERE expira_em IS NOT NULL;

-- Histórico de transmissões (sessões de viagem)
CREATE TABLE IF NOT EXISTS historico_transmissoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id          UUID,
  linha_nome         TEXT,
  inicio_em          TIMESTAMPTZ DEFAULT now(),
  fim_em             TIMESTAMPTZ,
  pontos_ganhos      INTEGER DEFAULT 0,
  ultima_atualizacao TIMESTAMPTZ DEFAULT now()
);
-- Impede duas sessões abertas simultâneas para o mesmo dispositivo
CREATE UNIQUE INDEX IF NOT EXISTS idx_transmissoes_unique_aberta
  ON historico_transmissoes (perfil_id) WHERE fim_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_transmissoes_perfil
  ON historico_transmissoes (perfil_id, inicio_em DESC);
CREATE INDEX IF NOT EXISTS idx_historico_transmissoes_linha
  ON historico_transmissoes (linha_nome, inicio_em DESC) WHERE pontos_ganhos > 0;

-- Trilha de coordenadas GPS gravadas
CREATE TABLE IF NOT EXISTS historico_coordenadas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id  UUID REFERENCES historico_transmissoes(id) ON DELETE CASCADE,
  linha_nome TEXT,
  latitude   DOUBLE PRECISION,
  longitude  DOUBLE PRECISION,
  criado_em  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historico_coords_linha_lat_lng
  ON historico_coordenadas (linha_nome, latitude, longitude);

-- Posições atuais dos ônibus no mapa (1 linha por dispositivo)
CREATE TABLE IF NOT EXISTS onibus_posicoes (
  id                 UUID PRIMARY KEY,
  linha_nome         TEXT,
  latitude           DOUBLE PRECISION,
  longitude          DOUBLE PRECISION,
  ultima_atualizacao TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onibus_posicoes_linha
  ON onibus_posicoes (linha_nome, ultima_atualizacao DESC);

-- Configurações globais do sistema (chave/valor)
CREATE TABLE IF NOT EXISTS configuracoes (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. TRIGGERS
-- ============================================================================

-- Preenche referral_code automaticamente em novos perfis
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_referral_code ON perfis;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON perfis
  FOR EACH ROW EXECUTE FUNCTION set_referral_code();

-- Define expiração do cupom (7 dias) no insert
CREATE OR REPLACE FUNCTION set_resgate_expiracao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.expira_em := COALESCE(NEW.criado_em, now()) + interval '7 days';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_resgate_expiracao ON resgates;
CREATE TRIGGER trg_set_resgate_expiracao
  BEFORE INSERT ON resgates
  FOR EACH ROW EXECUTE FUNCTION set_resgate_expiracao();

-- Atualiza timestamp da posição do ônibus em cada insert/update
CREATE OR REPLACE FUNCTION update_onibus_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.ultima_atualizacao = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_timestamp ON onibus_posicoes;
CREATE TRIGGER trg_update_timestamp
  BEFORE INSERT OR UPDATE ON onibus_posicoes
  FOR EACH ROW EXECUTE FUNCTION update_onibus_timestamp();

-- Atualiza timestamp de configuracoes
CREATE OR REPLACE FUNCTION atualizar_configuracao_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_configuracao_ts ON configuracoes;
CREATE TRIGGER trg_configuracao_ts
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_configuracao_ts();

-- ============================================================================
-- 3. FUNÇÕES RPC (chamadas pelo backend em /api/rpc/:name)
-- ============================================================================

-- Adiciona pontos com rate limit de 30 min
CREATE OR REPLACE FUNCTION adicionar_pontos(p_device_id TEXT, p_pontos INTEGER)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_add  TIMESTAMPTZ;
  v_new_total INTEGER;
BEGIN
  SELECT ultima_adicao_pontos INTO v_last_add FROM perfis WHERE id = p_device_id::uuid;

  IF v_last_add IS NOT NULL AND NOW() - v_last_add < INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'RATE_LIMITED: aguarde 30 minutos entre adições de pontos.';
  END IF;

  INSERT INTO perfis (id, pontos, ultima_adicao_pontos)
  VALUES (p_device_id::uuid, GREATEST(p_pontos, 0), NOW())
  ON CONFLICT (id) DO UPDATE
    SET pontos               = GREATEST(perfis.pontos + p_pontos, 0),
        ultima_adicao_pontos = NOW()
  RETURNING pontos INTO v_new_total;

  RETURN v_new_total;
END;
$$;

-- Atualiza streak diária e devolve bônus
CREATE OR REPLACE FUNCTION atualizar_streak(p_device_id TEXT, p_today DATE DEFAULT CURRENT_DATE)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_date      DATE;
  v_current_streak INTEGER;
  v_new_streak     INTEGER;
  v_bonus          INTEGER := 0;
BEGIN
  SELECT streak_atual, ultimo_dia_transmissao INTO v_current_streak, v_last_date
  FROM perfis WHERE id = p_device_id::uuid;

  v_current_streak := COALESCE(v_current_streak, 0);

  IF v_last_date = p_today THEN
    RETURN json_build_object('new_streak', v_current_streak, 'bonus_points', 0, 'is_milestone', FALSE);
  END IF;

  IF v_last_date = p_today - INTERVAL '1 day' THEN
    v_new_streak := v_current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  IF    v_new_streak = 3  THEN v_bonus := 5;
  ELSIF v_new_streak = 7  THEN v_bonus := 10;
  ELSIF v_new_streak = 14 THEN v_bonus := 20;
  ELSIF v_new_streak = 30 THEN v_bonus := 30;
  END IF;

  UPDATE perfis SET streak_atual = v_new_streak, ultimo_dia_transmissao = p_today
  WHERE id = p_device_id::uuid;

  RETURN json_build_object('new_streak', v_new_streak, 'bonus_points', v_bonus, 'is_milestone', v_bonus > 0);
END;
$$;

-- Atribui pontos + streak de forma atômica (usada ao fim da viagem)
CREATE OR REPLACE FUNCTION atribuir_pontos_viagem(p_device_id TEXT, p_pontos_base INTEGER DEFAULT 10)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_add   TIMESTAMPTZ;
  v_last_date  DATE;
  v_streak     INTEGER;
  v_new_streak INTEGER;
  v_bonus      INTEGER := 0;
  v_total      INTEGER;
  v_today      DATE := CURRENT_DATE;
BEGIN
  SELECT ultima_adicao_pontos, ultimo_dia_transmissao, streak_atual
  INTO v_last_add, v_last_date, v_streak
  FROM perfis WHERE id = p_device_id::uuid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('rate_limited', true, 'pontos_atribuidos', 0,
      'new_streak', 0, 'bonus_points', 0, 'is_milestone', false);
  END IF;

  IF v_last_add IS NOT NULL AND NOW() - v_last_add < INTERVAL '30 minutes' THEN
    RETURN json_build_object('rate_limited', true, 'pontos_atribuidos', 0,
      'new_streak', COALESCE(v_streak, 0), 'bonus_points', 0, 'is_milestone', false);
  END IF;

  v_streak := COALESCE(v_streak, 0);
  IF v_last_date IS NULL OR v_last_date < v_today - INTERVAL '1 day' THEN
    v_new_streak := 1;
  ELSIF v_last_date = v_today THEN
    v_new_streak := v_streak;
  ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := v_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  IF    v_new_streak = 3  THEN v_bonus := 5;
  ELSIF v_new_streak = 7  THEN v_bonus := 10;
  ELSIF v_new_streak = 14 THEN v_bonus := 20;
  ELSIF v_new_streak = 30 THEN v_bonus := 30;
  END IF;

  v_total := p_pontos_base + v_bonus;

  UPDATE perfis
  SET pontos = GREATEST(pontos + v_total, 0),
      streak_atual = v_new_streak,
      ultimo_dia_transmissao = v_today,
      ultima_adicao_pontos = NOW()
  WHERE id = p_device_id::uuid;

  RETURN json_build_object('rate_limited', false, 'pontos_atribuidos', v_total,
    'new_streak', v_new_streak, 'bonus_points', v_bonus, 'is_milestone', v_bonus > 0);
END;
$$;

-- Processa indicação (referral) — idempotente
CREATE OR REPLACE FUNCTION processar_referral(p_device_id TEXT, p_referral_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referrer_id  UUID;
  v_already_done BOOLEAN;
BEGIN
  SELECT referral_processado INTO v_already_done FROM perfis WHERE id = p_device_id::uuid;
  IF COALESCE(v_already_done, FALSE) THEN RETURN FALSE; END IF;

  SELECT id INTO v_referrer_id FROM perfis WHERE referral_code = UPPER(p_referral_code) LIMIT 1;
  IF v_referrer_id IS NULL OR v_referrer_id = p_device_id::uuid THEN RETURN FALSE; END IF;

  UPDATE perfis SET pontos = pontos + 15 WHERE id = v_referrer_id;
  UPDATE perfis SET pontos = pontos + 15, referral_processado = TRUE WHERE id = p_device_id::uuid;
  RETURN TRUE;
END;
$$;

-- Resgata um brinde gerando cupom (deduz pontos atomicamente)
CREATE OR REPLACE FUNCTION resgatar_brinde(p_device_id TEXT, p_pontos INTEGER, p_loja_nome TEXT, p_codigo TEXT)
RETURNS TABLE (id UUID, codigo TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_points INTEGER;
  v_resgate_id     UUID;
BEGIN
  SELECT pontos INTO v_current_points FROM perfis WHERE perfis.id = p_device_id::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  IF v_current_points < p_pontos THEN
    RAISE EXCEPTION 'Saldo insuficiente: % pontos disponíveis, % necessários', v_current_points, p_pontos;
  END IF;

  IF EXISTS (SELECT 1 FROM resgates WHERE resgates.perfil_id = p_device_id::uuid AND resgates.status = 'pendente' AND resgates.expira_em > now()) THEN
    RAISE EXCEPTION 'Já existe um cupom pendente ativo. Use-o antes de resgatar outro.';
  END IF;

  UPDATE perfis SET pontos = v_current_points - p_pontos, atualizado_em = now() WHERE perfis.id = p_device_id::uuid;

  INSERT INTO resgates (perfil_id, codigo, valor_pontos, loja_nome, status)
  VALUES (p_device_id::uuid, p_codigo, p_pontos, p_loja_nome, 'pendente')
  RETURNING resgates.id INTO v_resgate_id;

  RETURN QUERY SELECT v_resgate_id, p_codigo, 'pendente'::text;
END;
$$;

-- Cancela um resgate pendente e devolve os pontos
CREATE OR REPLACE FUNCTION cancelar_resgate(p_resgate_id UUID, p_device_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pontos INTEGER;
  v_status TEXT;
BEGIN
  SELECT valor_pontos, status INTO v_pontos, v_status
  FROM resgates WHERE id = p_resgate_id AND perfil_id = p_device_id::uuid;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_status != 'pendente' THEN RETURN FALSE; END IF;

  DELETE FROM resgates WHERE id = p_resgate_id;
  UPDATE perfis SET pontos = pontos + v_pontos WHERE id = p_device_id::uuid;
  RETURN TRUE;
END;
$$;

-- Valida cupom pelo lojista
CREATE OR REPLACE FUNCTION validar_cupom_lojista(p_codigo TEXT, p_loja_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loja_nome TEXT;
  v_resgate   RECORD;
BEGIN
  SELECT nome INTO v_loja_nome FROM lojas WHERE id = p_loja_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'Loja não encontrada.'); END IF;

  SELECT * INTO v_resgate FROM resgates WHERE codigo = UPPER(TRIM(p_codigo)) AND status = 'pendente';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'Cupom não encontrado ou já utilizado.'); END IF;

  IF v_resgate.expira_em IS NOT NULL AND v_resgate.expira_em < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Cupom expirado. O passageiro deve gerar um novo.');
  END IF;

  IF v_resgate.loja_nome IS DISTINCT FROM v_loja_nome THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este cupom é de outra loja e não pode ser validado aqui.');
  END IF;

  UPDATE resgates SET status = 'usado', validado_em = NOW() WHERE id = v_resgate.id;

  RETURN jsonb_build_object('ok', true, 'brinde', v_resgate.loja_nome, 'pontos', v_resgate.valor_pontos);
END;
$$;

-- Limpa cupons expirados e devolve os pontos
CREATE OR REPLACE FUNCTION limpar_cupons_expirados()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE perfis p SET pontos = p.pontos + r.valor_pontos, atualizado_em = now()
  FROM resgates r
  WHERE r.perfil_id = p.id AND r.status = 'pendente' AND r.expira_em < now() - interval '1 hour';

  UPDATE resgates SET status = 'expirado'
  WHERE status = 'pendente' AND expira_em < now() - interval '1 hour';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Verifica se a posição está na rota conhecida da linha
CREATE OR REPLACE FUNCTION verificar_posicao_na_rota(
  p_linha_nome TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_tolerancia_m DOUBLE PRECISION DEFAULT 200)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_validar_rota BOOLEAN;
  v_total_pontos BIGINT;
  v_delta_lat    DOUBLE PRECISION;
  v_delta_lng    DOUBLE PRECISION;
BEGIN
  SELECT validar_rota INTO v_validar_rota FROM linhas WHERE nome = p_linha_nome;
  IF NOT COALESCE(v_validar_rota, FALSE) THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_total_pontos FROM historico_coordenadas WHERE linha_nome = p_linha_nome;
  IF v_total_pontos < 50 THEN RETURN TRUE; END IF;

  v_delta_lat := p_tolerancia_m / 111320.0;
  v_delta_lng := p_tolerancia_m / (111320.0 * COS(RADIANS(p_lat)));

  RETURN EXISTS (
    SELECT 1 FROM historico_coordenadas
    WHERE linha_nome = p_linha_nome
      AND latitude  BETWEEN p_lat - v_delta_lat AND p_lat + v_delta_lat
      AND longitude BETWEEN p_lng - v_delta_lng AND p_lng + v_delta_lng
    LIMIT 1);
END;
$$;

-- Finaliza uma transmissão (idempotente)
CREATE OR REPLACE FUNCTION finalizar_transmissao(p_sessao_id UUID, p_fim_em TIMESTAMPTZ, p_pontos INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE historico_transmissoes
  SET fim_em = p_fim_em, pontos_ganhos = p_pontos
  WHERE id = p_sessao_id AND fim_em IS NULL;
END;
$$;

-- Heartbeat de transmissão ativa
CREATE OR REPLACE FUNCTION heartbeat_transmissao(p_sessao_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE historico_transmissoes
  SET ultima_atualizacao = NOW()
  WHERE id = p_sessao_id AND fim_em IS NULL;
END;
$$;

-- Limpa sessões órfãs e posições antigas
CREATE OR REPLACE FUNCTION limpar_sessoes_orfas()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE historico_transmissoes
  SET fim_em = NOW(), pontos_ganhos = 0
  WHERE fim_em IS NULL
    AND (inicio_em < NOW() - INTERVAL '90 minutes'
      OR (ultima_atualizacao IS NOT NULL AND ultima_atualizacao < NOW() - INTERVAL '10 minutes'));

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM onibus_posicoes WHERE ultima_atualizacao < NOW() - INTERVAL '10 minutes';
  RETURN v_count;
END;
$$;

-- Remove posição do mapa via sendBeacon
CREATE OR REPLACE FUNCTION remover_posicao_beacon(p_device_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM onibus_posicoes WHERE id = p_device_id::uuid;
END;
$$;

-- Verifica se um device_id já tem perfil (recuperação de conta)
CREATE OR REPLACE FUNCTION verificar_perfil_existe(p_device_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM perfis WHERE id = p_device_id::uuid);
END;
$$;

-- Incrementa contadores de anúncios (click/view)
CREATE OR REPLACE FUNCTION increment_anuncio_evento(p_anuncio_id UUID, p_tipo_evento TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tipo_evento = 'click' THEN
    UPDATE anuncios SET clicks = clicks + 1 WHERE id = p_anuncio_id;
  ELSIF p_tipo_evento = 'view' THEN
    UPDATE anuncios SET visualizacoes = visualizacoes + 1 WHERE id = p_anuncio_id;
  END IF;
  INSERT INTO anuncios_eventos (anuncio_id, tipo_evento) VALUES (p_anuncio_id, p_tipo_evento);
END;
$$;

-- ============================================================================
-- 4. SEED — configuração padrão
-- ============================================================================
INSERT INTO configuracoes (chave, valor) VALUES
  ('pontos_ativados', 'true'),
  ('evolution_url', ''),
  ('evolution_apikey', ''),
  ('evolution_instance', '')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================================
-- FIM — schema completo aplicado.
-- ============================================================================
