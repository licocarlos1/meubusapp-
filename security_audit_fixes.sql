-- ============================================================
-- MeuBusApp — Security Audit Fixes
-- Execute APÓS todos os patches anteriores.
-- Endereça os bugs críticos/altos da auditoria de segurança.
-- ============================================================

-- ─── BUG #2: RESTRINGIR LEITURA DE PERFIS ───────────────────
-- Problema: perfis_read usava USING (true) — qualquer pessoa via
-- todos os device_ids e saldos (enumeração + sequestro de conta).
-- Solução: cada dispositivo lê apenas o próprio perfil via header
-- x-device-id injetado pelo cliente (ver supabase.js).

DROP POLICY IF EXISTS "perfis_read" ON perfis;

-- Usuário anônimo: lê somente o próprio perfil (via x-device-id)
CREATE POLICY "perfis_read_own" ON perfis
  FOR SELECT USING (
    id = (
      nullif(current_setting('request.headers', true), '')::json->>'x-device-id'
    )::uuid
  );

-- Admin autenticado: acesso total para o painel admin
CREATE POLICY "perfis_read_admin" ON perfis
  FOR SELECT USING (
    auth.email() = 'licocarlos@gmail.com'
  );

-- ─── BUG #3: BLOQUEAR SESSÕES SIMULTÂNEAS ───────────────────
-- Problema: INSERT em historico_transmissoes não checava se o
-- mesmo perfil_id já tinha sessão aberta (fim_em IS NULL).
-- Impacto: usuário com 2 abas acumula pontos em paralelo.
-- Solução: índice UNIQUE parcial — o BD rejeita o 2º INSERT
-- com erro 23505 (unique_violation), tratado no frontend.

CREATE UNIQUE INDEX IF NOT EXISTS idx_transmissoes_unique_aberta
  ON historico_transmissoes (perfil_id)
  WHERE fim_em IS NULL;

-- ─── BUG #1: RPC PARA REMOVER POSIÇÃO VIA SENDBEACON ────────
-- Problema: sendBeacon só suporta POST; o DELETE em
-- onibus_posicoes não funcionava, e nem o POST para
-- finalizar_transmissao (faltava apikey na URL).
-- Esta RPC permite remover a posição via POST com apikey na URL.

CREATE OR REPLACE FUNCTION remover_posicao_beacon(p_device_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM onibus_posicoes WHERE id = p_device_id::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION remover_posicao_beacon TO anon, authenticated;

-- ─── BUG #4: RPC ATÔMICA STREAK + PONTOS ────────────────────
-- Problema: updateStreak() era chamado antes de addPoints().
-- Se addPoints() retornava 0 (rate limit de 30 min), a streak
-- já havia sido atualizada — usuário perdia pontos mas streak subia.
-- Solução: uma única transação verifica rate limit PRIMEIRO e,
-- só então, atualiza streak E pontos de forma indivisível.

CREATE OR REPLACE FUNCTION atribuir_pontos_viagem(
  p_device_id   TEXT,
  p_pontos_base INTEGER DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_add   TIMESTAMPTZ;
  v_last_date  DATE;
  v_streak     INTEGER;
  v_new_streak INTEGER;
  v_bonus      INTEGER := 0;
  v_total      INTEGER;
  v_today      DATE    := CURRENT_DATE;
BEGIN
  -- Lock da linha para evitar race condition (2 abas finalizando ao mesmo tempo)
  SELECT ultima_adicao_pontos, ultimo_dia_transmissao, streak_atual
  INTO   v_last_add, v_last_date, v_streak
  FROM   perfis
  WHERE  id = p_device_id::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'rate_limited', true, 'pontos_atribuidos', 0,
      'new_streak', 0, 'bonus_points', 0, 'is_milestone', false
    );
  END IF;

  -- Rate limit: máximo 1 adição de pontos a cada 30 minutos
  IF v_last_add IS NOT NULL AND NOW() - v_last_add < INTERVAL '30 minutes' THEN
    RETURN json_build_object(
      'rate_limited', true, 'pontos_atribuidos', 0,
      'new_streak', COALESCE(v_streak, 0), 'bonus_points', 0, 'is_milestone', false
    );
  END IF;

  -- Calcular nova streak
  v_streak := COALESCE(v_streak, 0);
  IF v_last_date IS NULL OR v_last_date < v_today - INTERVAL '1 day' THEN
    v_new_streak := 1;                           -- primeira viagem ou brecha no histórico
  ELSIF v_last_date = v_today THEN
    v_new_streak := v_streak;                    -- mesma data: mantém streak
  ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := v_streak + 1;                -- dia consecutivo
  ELSE
    v_new_streak := 1;
  END IF;

  -- Bônus por marcos de streak
  IF    v_new_streak = 3  THEN v_bonus := 5;
  ELSIF v_new_streak = 7  THEN v_bonus := 10;
  ELSIF v_new_streak = 14 THEN v_bonus := 20;
  ELSIF v_new_streak = 30 THEN v_bonus := 30;
  END IF;

  v_total := p_pontos_base + v_bonus;

  -- Atualização atômica: pontos + streak + timestamp do rate limit
  UPDATE perfis
  SET    pontos                 = GREATEST(pontos + v_total, 0),
         streak_atual           = v_new_streak,
         ultimo_dia_transmissao = v_today,
         ultima_adicao_pontos   = NOW()
  WHERE  id = p_device_id::uuid;

  RETURN json_build_object(
    'rate_limited',      false,
    'pontos_atribuidos', v_total,
    'new_streak',        v_new_streak,
    'bonus_points',      v_bonus,
    'is_milestone',      v_bonus > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION atribuir_pontos_viagem TO anon, authenticated;
