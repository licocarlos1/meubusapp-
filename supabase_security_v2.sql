-- ============================================================
-- MeuBusApp — Security Fixes v2 (corrigido: casts UUID)
-- Execute este arquivo no Supabase SQL Editor
-- ============================================================

-- ─── 1. BLOQUEAR UPDATE DIRETO EM RESGATES ──────────────────
DROP POLICY IF EXISTS "res_u" ON resgates;
-- Sem policy de UPDATE = UPDATE bloqueado via anon key
-- Apenas RPCs SECURITY DEFINER podem atualizar resgates

-- ─── 2. BLOQUEAR UPDATE DIRETO EM HISTORICO_TRANSMISSOES ────
DROP POLICY IF EXISTS "hist_t_u" ON historico_transmissoes;
-- Apenas RPCs SECURITY DEFINER (heartbeat, finalização) atualizam

-- ─── 3. RESTRINGIR INSERT DE COORDENADAS A SESSÕES VÁLIDAS ──
DROP POLICY IF EXISTS "hist_c_i" ON historico_coordenadas;
CREATE POLICY "hist_c_i" ON historico_coordenadas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM historico_transmissoes
      WHERE id = sessao_id
        AND fim_em IS NULL
        AND inicio_em > NOW() - INTERVAL '2 hours'
    )
  );

-- ─── 4. RPC: CANCELAR RESGATE DE FORMA ATÔMICA ──────────────
CREATE OR REPLACE FUNCTION cancelar_resgate(
  p_resgate_id UUID,
  p_device_id  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pontos INTEGER;
  v_status TEXT;
BEGIN
  SELECT valor_pontos, status
  INTO   v_pontos, v_status
  FROM   resgates
  WHERE  id = p_resgate_id
    AND  perfil_id = p_device_id::uuid;   -- cast: resgates.perfil_id é UUID

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status != 'pendente' THEN
    RETURN FALSE;
  END IF;

  DELETE FROM resgates WHERE id = p_resgate_id;

  UPDATE perfis
  SET    pontos = pontos + v_pontos
  WHERE  id = p_device_id::uuid;          -- cast: perfis.id é UUID

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancelar_resgate TO anon, authenticated;

-- ─── 5. RPC: VALIDAR CUPOM PELO LOJISTA ─────────────────────
CREATE OR REPLACE FUNCTION validar_cupom_lojista(
  p_codigo  TEXT,
  p_loja_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja_nome TEXT;
  v_resgate   RECORD;
BEGIN
  SELECT nome INTO v_loja_nome
  FROM   lojas WHERE id = p_loja_id;     -- p_loja_id já é UUID, sem cast necessário

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Loja não encontrada.');
  END IF;

  SELECT * INTO v_resgate
  FROM   resgates
  WHERE  codigo = UPPER(TRIM(p_codigo))
    AND  status = 'pendente';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Cupom não encontrado ou já utilizado.');
  END IF;

  IF v_resgate.expira_em IS NOT NULL AND v_resgate.expira_em < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Cupom expirado. O passageiro deve gerar um novo.');
  END IF;

  IF v_resgate.loja_nome IS DISTINCT FROM v_loja_nome THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este cupom é de outra loja e não pode ser validado aqui.');
  END IF;

  UPDATE resgates
  SET    status      = 'usado',
         validado_em = NOW()
  WHERE  id = v_resgate.id;

  RETURN jsonb_build_object(
    'ok',     true,
    'brinde', v_resgate.loja_nome,
    'pontos', v_resgate.valor_pontos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validar_cupom_lojista TO anon, authenticated;

-- ─── 6. RPC: VERIFICAR SE DEVICE_ID TEM PERFIL ──────────────
CREATE OR REPLACE FUNCTION verificar_perfil_existe(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql                         -- plpgsql em vez de sql para evitar checagem estrita
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfis
    WHERE id = p_device_id::uuid          -- cast explícito TEXT → UUID
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verificar_perfil_existe TO anon, authenticated;

-- ─── 7. CORRIGIR FUNÇÕES ANTERIORES (supabase_corrections.sql) ──
-- As funções plpgsql anteriores também comparam p_device_id TEXT com UUID.
-- Recriar com cast para evitar erros em runtime.

CREATE OR REPLACE FUNCTION atualizar_streak(
  p_device_id TEXT,
  p_today      DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_date       DATE;
  v_current_streak  INTEGER;
  v_new_streak      INTEGER;
  v_bonus           INTEGER := 0;
BEGIN
  SELECT streak_atual, ultimo_dia_transmissao
  INTO   v_current_streak, v_last_date
  FROM   perfis
  WHERE  id = p_device_id::uuid;          -- cast

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

  UPDATE perfis
  SET    streak_atual           = v_new_streak,
         ultimo_dia_transmissao = p_today
  WHERE  id = p_device_id::uuid;          -- cast

  RETURN json_build_object(
    'new_streak',   v_new_streak,
    'bonus_points', v_bonus,
    'is_milestone', v_bonus > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION processar_referral(
  p_device_id     TEXT,
  p_referral_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id    UUID;
  v_already_done   BOOLEAN;
BEGIN
  SELECT referral_processado INTO v_already_done
  FROM   perfis WHERE id = p_device_id::uuid;  -- cast

  IF COALESCE(v_already_done, FALSE) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_referrer_id
  FROM   perfis
  WHERE  referral_code = UPPER(p_referral_code)
  LIMIT  1;

  IF v_referrer_id IS NULL OR v_referrer_id = p_device_id::uuid THEN  -- cast
    RETURN FALSE;
  END IF;

  UPDATE perfis SET pontos = pontos + 15 WHERE id = v_referrer_id;
  UPDATE perfis
  SET    pontos              = pontos + 15,
         referral_processado = TRUE
  WHERE  id = p_device_id::uuid;          -- cast

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION adicionar_pontos(
  p_device_id TEXT,
  p_pontos    INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_add  TIMESTAMPTZ;
  v_new_total INTEGER;
BEGIN
  SELECT ultima_adicao_pontos INTO v_last_add
  FROM   perfis WHERE id = p_device_id::uuid;  -- cast

  IF v_last_add IS NOT NULL AND NOW() - v_last_add < INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'RATE_LIMITED: aguarde 30 minutos entre adições de pontos.';
  END IF;

  INSERT INTO perfis (id, pontos, ultima_adicao_pontos)
  VALUES (p_device_id::uuid, GREATEST(p_pontos, 0), NOW())  -- cast
  ON CONFLICT (id) DO UPDATE
    SET pontos               = GREATEST(perfis.pontos + p_pontos, 0),
        ultima_adicao_pontos = NOW()
  RETURNING pontos INTO v_new_total;

  RETURN v_new_total;
END;
$$;
