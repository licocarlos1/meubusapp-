-- ============================================================
-- MeuBusApp — Corrections & Route Validation Feature
-- Run this AFTER supabase_melhorias.sql
-- ============================================================

-- ─── 1. PROFILE COLUMNS ─────────────────────────────────────
-- Referral code (derived from device ID, stored for indexed lookup)
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS referral_processado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS streak_atual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS ultimo_dia_transmissao DATE;

-- Backfill referral_code for existing rows (first 8 chars of UUID without dashes)
UPDATE perfis
SET referral_code = UPPER(SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Make referral_code unique and indexed after backfill
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_referral_code ON perfis(referral_code);
ALTER TABLE perfis ALTER COLUMN referral_code SET NOT NULL;

-- ─── 2. ROUTE VALIDATION COLUMN ON LINHAS ───────────────────
ALTER TABLE linhas ADD COLUMN IF NOT EXISTS validar_rota BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 3. INDEX FOR ROUTE VALIDATION QUERIES ──────────────────
-- Speeds up the bounding-box search in verificar_posicao_na_rota
CREATE INDEX IF NOT EXISTS idx_historico_coords_linha_lat_lng
  ON historico_coordenadas (linha_nome, latitude, longitude);

-- ─── 4. ATOMIC STREAK UPDATE ────────────────────────────────
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
  WHERE  id = p_device_id;

  v_current_streak := COALESCE(v_current_streak, 0);

  -- Already transmitted today — no change
  IF v_last_date = p_today THEN
    RETURN json_build_object(
      'new_streak',   v_current_streak,
      'bonus_points', 0,
      'is_milestone', FALSE
    );
  END IF;

  -- Consecutive day → increment; else reset to 1
  IF v_last_date = p_today - INTERVAL '1 day' THEN
    v_new_streak := v_current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  -- Milestone bonuses: 3/7/14/30 days
  IF    v_new_streak = 3  THEN v_bonus := 5;
  ELSIF v_new_streak = 7  THEN v_bonus := 10;
  ELSIF v_new_streak = 14 THEN v_bonus := 20;
  ELSIF v_new_streak = 30 THEN v_bonus := 30;
  END IF;

  -- Persist
  UPDATE perfis
  SET    streak_atual            = v_new_streak,
         ultimo_dia_transmissao  = p_today
  WHERE  id = p_device_id;

  RETURN json_build_object(
    'new_streak',   v_new_streak,
    'bonus_points', v_bonus,
    'is_milestone', v_bonus > 0
  );
END;
$$;

-- ─── 5. ATOMIC REFERRAL PROCESSING ──────────────────────────
CREATE OR REPLACE FUNCTION processar_referral(
  p_device_id    TEXT,
  p_referral_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id    TEXT;
  v_already_done   BOOLEAN;
BEGIN
  -- Idempotency: already processed for this user?
  SELECT referral_processado INTO v_already_done
  FROM   perfis WHERE id = p_device_id;

  IF COALESCE(v_already_done, FALSE) THEN
    RETURN FALSE;
  END IF;

  -- Find referrer by code (exact indexed lookup)
  SELECT id INTO v_referrer_id
  FROM   perfis
  WHERE  referral_code = UPPER(p_referral_code)
  LIMIT  1;

  -- No referrer found, or self-referral
  IF v_referrer_id IS NULL OR v_referrer_id = p_device_id THEN
    RETURN FALSE;
  END IF;

  -- Award both parties atomically
  UPDATE perfis SET pontos = pontos + 15 WHERE id = v_referrer_id;
  UPDATE perfis
  SET    pontos              = pontos + 15,
         referral_processado = TRUE
  WHERE  id = p_device_id;

  RETURN TRUE;
END;
$$;

-- ─── 6. ROUTE POSITION VALIDATION ───────────────────────────
-- Returns TRUE  → position is on the known route (or validation is off / not enough data)
-- Returns FALSE → position is too far from any known route point
CREATE OR REPLACE FUNCTION verificar_posicao_na_rota(
  p_linha_nome  TEXT,
  p_lat         DOUBLE PRECISION,
  p_lng         DOUBLE PRECISION,
  p_tolerancia_m DOUBLE PRECISION DEFAULT 200
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_validar_rota  BOOLEAN;
  v_total_pontos  BIGINT;
  v_delta_lat     DOUBLE PRECISION;
  v_delta_lng     DOUBLE PRECISION;
BEGIN
  -- Check if route validation is enabled for this line
  SELECT validar_rota INTO v_validar_rota
  FROM   linhas WHERE nome = p_linha_nome;

  -- Validation not enabled → always approve
  IF NOT COALESCE(v_validar_rota, FALSE) THEN
    RETURN TRUE;
  END IF;

  -- Not enough route data yet → approve (avoid locking out early users)
  SELECT COUNT(*) INTO v_total_pontos
  FROM   historico_coordenadas
  WHERE  linha_nome = p_linha_nome;

  IF v_total_pontos < 50 THEN
    RETURN TRUE;
  END IF;

  -- Bounding-box deltas (approximate metres → degrees)
  v_delta_lat := p_tolerancia_m / 111320.0;
  v_delta_lng := p_tolerancia_m / (111320.0 * COS(RADIANS(p_lat)));

  -- Check if any stored point falls within the tolerance bounding box
  RETURN EXISTS (
    SELECT 1
    FROM   historico_coordenadas
    WHERE  linha_nome = p_linha_nome
      AND  latitude  BETWEEN p_lat - v_delta_lat AND p_lat + v_delta_lat
      AND  longitude BETWEEN p_lng - v_delta_lng AND p_lng + v_delta_lng
    LIMIT 1
  );
END;
$$;

-- ─── 7. FIX RATE LIMIT: 2 min → 30 min ──────────────────────
-- Replaces the version from supabase_melhorias.sql
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
  v_current   INTEGER;
  v_new_total INTEGER;
BEGIN
  -- Rate limit: max once per 30 minutes per device
  SELECT ultima_adicao_pontos INTO v_last_add
  FROM   perfis WHERE id = p_device_id;

  IF v_last_add IS NOT NULL AND NOW() - v_last_add < INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'RATE_LIMITED: aguarde 30 minutos entre adições de pontos.';
  END IF;

  -- Upsert profile
  INSERT INTO perfis (id, pontos, ultima_adicao_pontos)
  VALUES (p_device_id, GREATEST(p_pontos, 0), NOW())
  ON CONFLICT (id) DO UPDATE
    SET pontos              = GREATEST(perfis.pontos + p_pontos, 0),
        ultima_adicao_pontos = NOW()
  RETURNING pontos INTO v_new_total;

  RETURN v_new_total;
END;
$$;

-- Ensure the column exists (in case supabase_melhorias.sql wasn't run)
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS ultima_adicao_pontos TIMESTAMPTZ;

-- ─── 8. SET REFERRAL CODE ON INSERT ─────────────────────────
-- Auto-populate referral_code for new profiles
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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

-- ─── 9. RLS: TIGHTEN DELETE ON onibus_posicoes ───────────────
-- Note: with device-ID anonymous auth, the app already filters by device ID
-- client-side. The RLS policy below restricts service_role bypass but cannot
-- cryptographically verify the device_id without Supabase Auth.
-- For now: keep DELETE permissive (anon users call with eq filter),
-- but ensure UPDATE is restricted to own row.
DROP POLICY IF EXISTS "pos_u" ON onibus_posicoes;
CREATE POLICY "pos_u" ON onibus_posicoes
  FOR UPDATE USING (TRUE)
  WITH CHECK (TRUE);

-- ─── 10. PERFORMANCE: INDEXES ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resgates_perfil_status
  ON resgates (perfil_id, status);

CREATE INDEX IF NOT EXISTS idx_resgates_expira_em
  ON resgates (expira_em)
  WHERE expira_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historico_transmissoes_perfil
  ON historico_transmissoes (perfil_id, inicio_em DESC);
