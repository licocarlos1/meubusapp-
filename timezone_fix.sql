-- ============================================================
-- MeuBusApp — Correção de Fuso Horário e Nomenclatura
-- ============================================================

-- 1. Definir o fuso horário padrão do banco de dados para Brasília (UTC-3)
-- Isso garante que funções como now() e filtros de data funcionem corretamente.
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';

-- 2. Garantir que todas as colunas de timestamp usem TIMESTAMPTZ 
-- (Timestamp with time zone) para conversão automática correta.
-- Nota: A maioria das tabelas Supabase já usa isso por padrão, 
-- mas estes comandos garantem a consistência.

DO $$ 
BEGIN
    -- perfis
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'perfis' AND column_name = 'atualizado_em') THEN
        ALTER TABLE perfis ALTER COLUMN atualizado_em TYPE TIMESTAMPTZ;
        ALTER TABLE perfis ALTER COLUMN atualizado_em SET DEFAULT now();
    END IF;

    -- resgates
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resgates' AND column_name = 'criado_em') THEN
        ALTER TABLE resgates ALTER COLUMN criado_em TYPE TIMESTAMPTZ;
        ALTER TABLE resgates ALTER COLUMN criado_em SET DEFAULT now();
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resgates' AND column_name = 'validado_em') THEN
        ALTER TABLE resgates ALTER COLUMN validado_em TYPE TIMESTAMPTZ;
    END IF;

    -- historico_transmissoes
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historico_transmissoes' AND column_name = 'inicio_em') THEN
        ALTER TABLE historico_transmissoes ALTER COLUMN inicio_em TYPE TIMESTAMPTZ;
        ALTER TABLE historico_transmissoes ALTER COLUMN inicio_em SET DEFAULT now();
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historico_transmissoes' AND column_name = 'fim_em') THEN
        ALTER TABLE historico_transmissoes ALTER COLUMN fim_em TYPE TIMESTAMPTZ;
    END IF;

    -- historico_coordenadas
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historico_coordenadas' AND column_name = 'criado_em') THEN
        ALTER TABLE historico_coordenadas ALTER COLUMN criado_em TYPE TIMESTAMPTZ;
        ALTER TABLE historico_coordenadas ALTER COLUMN criado_em SET DEFAULT now();
    END IF;

    -- onibus_posicoes
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onibus_posicoes' AND column_name = 'ultima_atualizacao') THEN
        ALTER TABLE onibus_posicoes ALTER COLUMN ultima_atualizacao TYPE TIMESTAMPTZ;
        ALTER TABLE onibus_posicoes ALTER COLUMN ultima_atualizacao SET DEFAULT now();
    END IF;
END $$;

-- 3. Reiniciar a sessão para aplicar as mudanças de fuso horário imediatamente
-- (Apenas para esta janela do editor SQL, as novas conexões já virão com o fuso certo)
SET timezone TO 'America/Sao_Paulo';

-- Verificação:
SELECT now() as "Horario Atual em Sete Lagoas (Brasilia)";
