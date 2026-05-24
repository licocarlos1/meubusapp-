-- ============================================================
-- MeuBusApp — Correção de Transmissões Órfãs
-- ============================================================
-- Este script corrige transmissões que ficaram abertas indefinidamente
-- e adiciona mecanismo automático de limpeza.

-- 1. Finalizar TODAS as transmissões abertas há mais de 60 minutos
UPDATE historico_transmissoes
SET fim_em = NOW(),
    pontos_ganhos = 0
WHERE fim_em IS NULL
  AND inicio_em < NOW() - INTERVAL '60 minutes';

-- 2. Remover posições de ônibus órfãs (mais antigas que 60 minutos)
DELETE FROM onibus_posicoes
WHERE ultima_atualizacao < NOW() - INTERVAL '60 minutes';

-- 3. Criar função automática para finalizar transmissões antigas
CREATE OR REPLACE FUNCTION cleanup_stale_transmissions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Finalizar transmissões abertas há mais de 60 minutos
    UPDATE historico_transmissoes
    SET fim_em = NOW(),
        pontos_ganhos = 0
    WHERE fim_em IS NULL
      AND inicio_em < NOW() - INTERVAL '60 minutes';
    
    -- Remover posições de ônibus antigas (mais de 60 minutos sem atualização)
    DELETE FROM onibus_posicoes
    WHERE ultima_atualizacao < NOW() - INTERVAL '60 minutes';
    
    -- Remover coordenadas históricas muito antigas (mais de 90 dias) para economizar espaço
    DELETE FROM historico_coordenadas
    WHERE criado_em < NOW() - INTERVAL '90 days';
END;
$$;

-- Conceder permissão para usuários anonimos chamarem a função
GRANT EXECUTE ON FUNCTION cleanup_stale_transmissions TO anon, authenticated;

-- 4. Adicionar trigger automática: ao inserir nova posição, atualizar timestamp
-- Isso garante que ultima_atualizacao seja sempre recente durante transmissão ativa
CREATE OR REPLACE FUNCTION update_onibus_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.ultima_atualizacao = NOW();
    RETURN NEW;
END;
$$;

-- Aplicar trigger na tabela
DROP TRIGGER IF EXISTS trg_update_timestamp ON onibus_posicoes;
CREATE TRIGGER trg_update_timestamp
    BEFORE INSERT OR UPDATE ON onibus_posicoes
    FOR EACH ROW
    EXECUTE FUNCTION update_onibus_timestamp();

-- 5. Verificação: Mostrar transmissões recentes
SELECT 
    id,
    perfil_id,
    linha_nome,
    inicio_em,
    fim_em,
    pontos_ganhos,
    CASE 
        WHEN fim_em IS NULL THEN '⚠️ ABERTA'
        ELSE '✅ Encerrada'
    END as status
FROM historico_transmissoes
ORDER BY inicio_em DESC
LIMIT 50;

-- Para executar a limpeza manual:
-- SELECT cleanup_stale_transmissions();
