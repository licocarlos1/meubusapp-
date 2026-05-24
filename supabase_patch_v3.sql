-- ============================================================
-- MeuBusApp — Patch v3
-- Corrige o bug criado pelo security_v2: a remoção da policy
-- hist_t_u quebrou finalização de viagem, heartbeat e cleanup.
-- Solução: mover essas operações para RPCs SECURITY DEFINER.
-- Execute APÓS o supabase_security_v2.sql corrigido.
-- ============================================================

-- ─── 1. RPC: FINALIZAR TRANSMISSÃO ──────────────────────────
-- Substitui o UPDATE direto em historico_transmissoes no app.
CREATE OR REPLACE FUNCTION finalizar_transmissao(
  p_sessao_id UUID,
  p_fim_em    TIMESTAMPTZ,
  p_pontos    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE historico_transmissoes
  SET    fim_em        = p_fim_em,
         pontos_ganhos = p_pontos
  WHERE  id     = p_sessao_id
    AND  fim_em IS NULL;   -- idempotente: não sobrescreve sessões já fechadas
END;
$$;

GRANT EXECUTE ON FUNCTION finalizar_transmissao TO anon, authenticated;

-- ─── 2. RPC: HEARTBEAT DE TRANSMISSÃO ───────────────────────
CREATE OR REPLACE FUNCTION heartbeat_transmissao(p_sessao_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE historico_transmissoes
  SET    ultima_atualizacao = NOW()
  WHERE  id     = p_sessao_id
    AND  fim_em IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION heartbeat_transmissao TO anon, authenticated;

-- ─── 3. RPC: AUTO-LIMPEZA DE SESSÕES ÓRFÃS ──────────────────
-- Fecha automaticamente qualquer transmissão aberta há mais de 90 minutos
-- sem heartbeat nos últimos 10 minutos.
-- O app chama isso na abertura de cada sessão do Broadcaster.
CREATE OR REPLACE FUNCTION limpar_sessoes_orfas()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE historico_transmissoes
  SET    fim_em        = NOW(),
         pontos_ganhos = 0
  WHERE  fim_em IS NULL
    AND  (
      -- Sessão aberta há mais de 90 minutos (independente do heartbeat)
      inicio_em < NOW() - INTERVAL '90 minutes'
      OR
      -- Ou último heartbeat há mais de 10 minutos (app fechou)
      (ultima_atualizacao IS NOT NULL AND ultima_atualizacao < NOW() - INTERVAL '10 minutes')
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Também limpa posições no mapa de sessões órfãs
  -- (dispositivos sem transmissão ativa há mais de 10 min)
  DELETE FROM onibus_posicoes
  WHERE ultima_atualizacao < NOW() - INTERVAL '10 minutes';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION limpar_sessoes_orfas TO anon, authenticated;

-- ─── 4. POLICY UPDATE PARA O PAINEL ADMIN ───────────────────
-- Apenas o admin autenticado pode fazer UPDATE direto.
DROP POLICY IF EXISTS "hist_t_u_admin" ON historico_transmissoes;
CREATE POLICY "hist_t_u_admin" ON historico_transmissoes
  FOR UPDATE USING (auth.email() = 'licocarlos@gmail.com');

-- ─── 5. FECHAR SESSÕES ÓRFÃS EXISTENTES AGORA ───────────────
-- Executa imediatamente para limpar o estado atual do banco
UPDATE historico_transmissoes
SET    fim_em        = NOW(),
       pontos_ganhos = 0
WHERE  fim_em IS NULL
  AND  inicio_em < NOW() - INTERVAL '90 minutes';

DELETE FROM onibus_posicoes
WHERE ultima_atualizacao < NOW() - INTERVAL '10 minutes';
