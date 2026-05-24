-- ============================================================
-- Tracking de AnúncIOS - Cliques e Visualizações
-- ============================================================

-- Adicionar colunas de tracking na tabela anuncios
ALTER TABLE anuncios
ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visualizacoes INTEGER DEFAULT 0;

-- Criar tabela de histórico detalhado de eventos (opcional, para analytics avançado)
CREATE TABLE IF NOT EXISTS anuncios_eventos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    anuncio_id UUID REFERENCES anuncios(id) ON DELETE CASCADE,
    tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('click', 'view')),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- Políticas de segurança para tracking
ALTER TABLE anuncios_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode inserir eventos (para o componente AdBanner funcionar)
CREATE POLICY "anu_evt_ins" ON anuncios_eventos FOR INSERT WITH CHECK (true);

-- Apenas admin pode visualizar o histórico detalhado
CREATE POLICY "anu_evt_adm_r" ON anuncios_eventos FOR SELECT USING (auth.email() = 'licocarlos@gmail.com');

-- Atualizar política da tabela anuncios para permitir update nas colunas de tracking
-- Mantém a política existente mas permite que clicks/visualizacoes sejam incrementados publicamente
DROP POLICY IF EXISTS "anu_adm_all" ON anuncios;
CREATE POLICY "anu_adm_all" ON anuncios FOR ALL USING (auth.email() = 'licocarlos@gmail.com');

-- Criar função para incrementar contadores de forma segura
CREATE OR REPLACE FUNCTION increment_anuncio_evento(
    p_anuncio_id UUID,
    p_tipo_evento TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com permissões de admin
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
