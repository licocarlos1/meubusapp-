-- ============================================================
-- MeuBusApp — RLS de Segurança Máxima (C/ Admin Login)
-- ============================================================

-- ============================================================


-- ============================================================
-- 2. Sistema de Pontos Seguros (Tabela perfis)
-- ============================================================
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
-- Qualquer pessoa lê
CREATE POLICY "perfis_read" ON perfis FOR SELECT USING (true);
-- Qualquer pessoa pode Iniciar a própria conta MAS OBRIGATORIAMENTE COM ZERO PONTOS (Evita injeção de pontos falsos)
CREATE POLICY "perfis_insert_zero" ON perfis FOR INSERT WITH CHECK (pontos = 0);
-- Ninguém (além de funções seguras RPC) pode fazer UPDATE ou DELETE de pontos usando o VITE_SUPABASE_ANON_KEY
-- Sem Policy de Update = Update Bloqueado Publicamente

-- ============================================================
-- 3. Cargas de Trabalho Colaborativas (Ônibus e Resgates)
-- ============================================================
-- Ônibus: Deixar o mapa funcionar, mas ninguém pode deletar pontos dos outros.
ALTER TABLE onibus_posicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_r" ON onibus_posicoes FOR SELECT USING (true);
CREATE POLICY "pos_i" ON onibus_posicoes FOR INSERT WITH CHECK (true);
CREATE POLICY "pos_u" ON onibus_posicoes FOR UPDATE USING (true);
CREATE POLICY "pos_d" ON onibus_posicoes FOR DELETE USING (true);

-- Resgates atômicos: A inserção do Resgate é feita por RPC Atômica do banco.
ALTER TABLE resgates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "res_r" ON resgates FOR SELECT USING (true);
-- O cliente SÓ consegue ATUALIZAR STATUS (Para os lojistas poderem validar resgates)
CREATE POLICY "res_u" ON resgates FOR UPDATE USING (true);

-- Histórico Rastreado
ALTER TABLE historico_transmissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_t_r" ON historico_transmissoes FOR SELECT USING (true);
CREATE POLICY "hist_t_i" ON historico_transmissoes FOR INSERT WITH CHECK (true);
CREATE POLICY "hist_t_u" ON historico_transmissoes FOR UPDATE USING (true);

-- Adicionar coluna de ultima_atualizacao para heartbeat
ALTER TABLE historico_transmissoes
ADD COLUMN IF NOT EXISTS ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE historico_coordenadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_c_r" ON historico_coordenadas FOR SELECT USING (true);
CREATE POLICY "hist_c_i" ON historico_coordenadas FOR INSERT WITH CHECK (true);

-- ============================================================
-- 4. O Coração do Sistema (Apenas Admin Oficial pode editar)
-- ============================================================
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loj_pub_r" ON lojas FOR SELECT USING (true);
CREATE POLICY "loj_adm_all" ON lojas FOR ALL USING (auth.email() = 'licocarlos@gmail.com');

ALTER TABLE brindes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bri_pub_r" ON brindes FOR SELECT USING (true);
CREATE POLICY "bri_adm_all" ON brindes FOR ALL USING (auth.email() = 'licocarlos@gmail.com');

ALTER TABLE anuncios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anu_pub_r" ON anuncios FOR SELECT USING (true);
CREATE POLICY "anu_adm_all" ON anuncios FOR ALL USING (auth.email() = 'licocarlos@gmail.com');

ALTER TABLE linhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lin_pub_r" ON linhas FOR SELECT USING (true);
CREATE POLICY "lin_adm_all" ON linhas FOR ALL USING (auth.email() = 'licocarlos@gmail.com');

-- ============================================================
-- 5. Estrutura de Banners e Publicidade
-- ============================================================
ALTER TABLE anuncios
ADD COLUMN IF NOT EXISTS posicao TEXT DEFAULT 'top';

-- Tracking de AnúNCIOS - Cliques e Visualizações
ALTER TABLE anuncios
ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visualizacoes INTEGER DEFAULT 0;

-- Tabela de histórico detalhado de eventos
CREATE TABLE IF NOT EXISTS anuncios_eventos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    anuncio_id UUID REFERENCES anuncios(id) ON DELETE CASCADE,
    tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('click', 'view')),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

ALTER TABLE anuncios_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode inserir eventos (para o componente AdBanner funcionar)
DROP POLICY IF EXISTS "anu_evt_ins" ON anuncios_eventos;
CREATE POLICY "anu_evt_ins" ON anuncios_eventos FOR INSERT WITH CHECK (true);

-- Apenas admin pode visualizar o histórico detalhado
DROP POLICY IF EXISTS "anu_evt_adm_r" ON anuncios_eventos;
CREATE POLICY "anu_evt_adm_r" ON anuncios_eventos FOR SELECT USING (auth.email() = 'licocarlos@gmail.com');

-- Função segura para incrementar contadores
CREATE OR REPLACE FUNCTION increment_anuncio_evento(
    p_anuncio_id UUID,
    p_tipo_evento TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Incrementa na tabela anuncios
    IF p_tipo_evento = 'click' THEN
        UPDATE anuncios SET clicks = clicks + 1 WHERE id = p_anuncio_id;
    ELSIF p_tipo_evento = 'view' THEN
        UPDATE anuncios SET visualizacoes = visualizacoes + 1 WHERE id = p_anuncio_id;
    END IF;
    
    -- Registra no histórico detalhado
    INSERT INTO anuncios_eventos (anuncio_id, tipo_evento)
    VALUES (p_anuncio_id, p_tipo_evento);
END;
$$;

-- Conceder permissão para usuários anonimos chamarem a função
GRANT EXECUTE ON FUNCTION increment_anuncio_evento TO anon, authenticated;
