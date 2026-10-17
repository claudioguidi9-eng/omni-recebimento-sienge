
-- =========================================================================
-- OMNI FISCAL AI - ESQUEMA DE BANCO DE DADOS RELACIONAL (POSTGRESQL / SUPABASE)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.omni_recebimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave_nfe VARCHAR(44) NOT NULL,
    numero_nf VARCHAR(20) NOT NULL,
    serie VARCHAR(5) DEFAULT '1',
    data_emissao DATE,
    emitente_nome VARCHAR(255) NOT NULL,
    emitente_cnpj VARCHAR(20),
    valor_total_nf NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    pedido_sienge VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEBIDO_OK', 
    -- 'RECEBIDO_OK', 'PENDENTE_SUPERVISOR', 'BLOQUEADO_DIVERGENCIA', 'APROVADO_RESSALVA', 'REJEITADO_DEVOLUCAO'
    tentativas_contagem INT DEFAULT 1,
    conferente_nome VARCHAR(150),
    supervisor_nome VARCHAR(150),
    supervisor_email VARCHAR(150),
    justificativa_supervisor TEXT,
    pedido_ajustado_sienge BOOLEAN DEFAULT FALSE,
    itens_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_chave ON public.omni_recebimentos(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_pedido ON public.omni_recebimentos(pedido_sienge);
CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_status ON public.omni_recebimentos(status);
CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_created_at ON public.omni_recebimentos(created_at DESC);

-- Habilitar RLS e Politicas se desejado:
ALTER TABLE public.omni_recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura publica" ON public.omni_recebimentos FOR SELECT USING (true);
CREATE POLICY "Permitir insercao publica" ON public.omni_recebimentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualizacao publica" ON public.omni_recebimentos FOR UPDATE USING (true);
