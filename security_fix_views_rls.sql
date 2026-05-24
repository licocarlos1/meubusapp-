-- ============================================================
-- security_fix_views_rls.sql
-- Corrige os 3 alertas do Supabase Security Advisor:
--   1. resgates_validos — SECURITY DEFINER view
--   2. ranking_mensal   — SECURITY DEFINER view
--   3. spatial_ref_sys  — RLS desabilitado em tabela pública
--
-- Execute este script no SQL Editor do Supabase.
-- Requer PostgreSQL 15+ (disponível em todos os projetos Supabase).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Recriar resgates_validos com security_invoker=true
--    Assim a view respeita o RLS da tabela resgates e as
--    permissões do usuário que faz a consulta.
-- ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.resgates_validos;

CREATE VIEW public.resgates_validos
  WITH (security_invoker=true)
AS
  SELECT * FROM public.resgates
  WHERE status = 'pendente'
    AND expira_em > now();


-- ────────────────────────────────────────────────────────────
-- 2. Recriar ranking_mensal com security_invoker=true
--    A view continua de leitura pública (dados de ranking
--    anônimos), mas passa a operar sob as permissões do
--    usuário chamador em vez do owner da view.
-- ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.ranking_mensal;

CREATE VIEW public.ranking_mensal
  WITH (security_invoker=true)
AS
  SELECT
    linha_nome,
    perfil_id,
    COUNT(*)                                                    AS total_viagens,
    SUM(pontos_ganhos)                                          AS total_pontos,
    RANK() OVER (PARTITION BY linha_nome ORDER BY COUNT(*) DESC) AS posicao
  FROM public.historico_transmissoes
  WHERE pontos_ganhos > 0
    AND inicio_em >= date_trunc('month', now())
  GROUP BY linha_nome, perfil_id;

-- Garantir leitura pública do ranking (anon + authenticated)
GRANT SELECT ON public.ranking_mensal TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. spatial_ref_sys — tabela de sistema do PostGIS
--    Não é possível habilitar RLS diretamente (exige ser dono).
--    Solução: revogar o acesso das roles da API (anon e
--    authenticated). A tabela continua acessível internamente
--    pelo postgres/service_role, mas some do PostgREST para
--    usuários externos — eliminando o alerta de segurança.
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
