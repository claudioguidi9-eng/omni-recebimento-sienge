-- =========================================================================
-- OMNI FISCAL AI & WMS CLOUD - ESQUEMA DE BANCO DE DADOS COMPLETO (SUPABASE / POSTGRESQL)
-- Versão 3.0: Recebimento Cego, Amarração Sienge, WMS Lotes/Endereçamento, PCP Ficha Técnica (-PA)
-- =========================================================================

-- 1. TABELA DE DF-e / XMLs AUTOMÁTICOS DA SEFAZ POR CNPJ
CREATE TABLE IF NOT EXISTS public.omni_dfe_xmls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave_nfe VARCHAR(44) UNIQUE NOT NULL,
    numero_nf VARCHAR(20) NOT NULL,
    serie VARCHAR(5) DEFAULT '1',
    data_emissao TIMESTAMP WITH TIME ZONE,
    emitente_cnpj VARCHAR(20) NOT NULL,
    emitente_nome VARCHAR(255) NOT NULL,
    valor_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    xml_conteudo TEXT,
    pedido_compra_sienge VARCHAR(50),
    status_dfe VARCHAR(50) DEFAULT 'BAIXADO_SEFAZ', -- 'BAIXADO_SEFAZ', 'EM_TRANSITO', 'DOCA_RECEBENDO', 'CONFERIDO', 'AMARRADO_SIENGE'
    data_download TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_dfe_chave ON public.omni_dfe_xmls(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_dfe_status ON public.omni_dfe_xmls(status_dfe);

-- 2. TABELA DE CONFERÊNCIA CEGA DE DOCA (RECEBIMENTO FÍSICO)
CREATE TABLE IF NOT EXISTS public.omni_recebimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave_nfe VARCHAR(44) NOT NULL,
    numero_nf VARCHAR(20) NOT NULL,
    serie VARCHAR(5) DEFAULT '1',
    data_emissao DATE,
    emitente_nome VARCHAR(255) NOT NULL,
    emitente_cnpj VARCHAR(20),
    valor_total_nf NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    pedido_sienge VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'CONFERIDO_AGUARDANDO_FISCAL', 
    -- 'CONFERIDO_AGUARDANDO_FISCAL', 'PENDENTE_SUPERVISOR', 'BLOQUEADO_DIVERGENCIA', 'AMARRADO_SIENGE', 'REJEITADO'
    tentativas_contagem INT DEFAULT 1,
    conferente_nome VARCHAR(150),
    supervisor_nome VARCHAR(150),
    supervisor_email VARCHAR(150),
    justificativa_supervisor TEXT,
    itens_conferidos JSONB, -- [{ codigo, desc, un, qtdContada, lote, dataValidade, dataFabricacao, match }]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_chave ON public.omni_recebimentos(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_omni_recebimentos_status ON public.omni_recebimentos(status);

-- 3. TABELA DE CADASTRO DE ENDEREÇOS FÍSICOS DO GALPÃO (WMS)
CREATE TABLE IF NOT EXISTS public.omni_enderecos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_endereco VARCHAR(30) UNIQUE NOT NULL, -- Ex: 'R01-P03-B02' (Rua 1, Prateleira 3, Box 2)
    galpao VARCHAR(50) DEFAULT 'Galpão Principal',
    rua VARCHAR(10) NOT NULL,
    prateleira VARCHAR(10) NOT NULL,
    nivel VARCHAR(10) NOT NULL,
    box VARCHAR(10) NOT NULL,
    tipo VARCHAR(30) DEFAULT 'PALLET', -- 'PALLET', 'PRATELEIRA', 'BLOCADO', 'DOCA_ENTRADA', 'DOCA_SAIDA'
    capacidade_peso_kg NUMERIC(10, 2) DEFAULT 1000.00,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_enderecos_codigo ON public.omni_enderecos(codigo_endereco);

-- 4. TABELA DE CADASTRO E RASTREABILIDADE DE LOTES & VALIDADES
CREATE TABLE IF NOT EXISTS public.omni_lotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_lote VARCHAR(50) NOT NULL,
    codigo_produto VARCHAR(50) NOT NULL,
    descricao_produto VARCHAR(255),
    data_fabricacao DATE,
    data_validade DATE NOT NULL,
    fornecedor_cnpj VARCHAR(20),
    fornecedor_nome VARCHAR(255),
    laudo_qualidade_url TEXT,
    status_qualidade VARCHAR(30) DEFAULT 'APROVADO', -- 'APROVADO', 'QUARENTENA', 'REPROVADO', 'VENCIDO'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_produto_lote UNIQUE (numero_lote, codigo_produto)
);
CREATE INDEX IF NOT EXISTS idx_lotes_num ON public.omni_lotes(numero_lote);
CREATE INDEX IF NOT EXISTS idx_lotes_validade ON public.omni_lotes(data_validade);

-- 5. TABELA DE SALDO FÍSICO DO WMS (COM 'A_ENDERECAR' ESTILO PROTHEUS SDA/SDB)
CREATE TABLE IF NOT EXISTS public.omni_estoque_wms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_produto VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    unidade VARCHAR(10) NOT NULL,
    numero_lote VARCHAR(50) NOT NULL,
    data_validade DATE,
    codigo_endereco VARCHAR(30) DEFAULT 'DOCA_RECEBIMENTO',
    quantidade NUMERIC(15, 3) NOT NULL DEFAULT 0.000,
    status_estoque VARCHAR(30) NOT NULL DEFAULT 'A_ENDERECAR', -- 'A_ENDERECAR', 'DISPONIVEL', 'RESERVADO_OP', 'BLOQUEADO'
    documento_origem VARCHAR(50), -- Ex: 'NF 45612' ou 'OP 2026-001'
    pedido_sienge VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_wms_status ON public.omni_estoque_wms(status_estoque);
CREATE INDEX IF NOT EXISTS idx_wms_prod_lote ON public.omni_estoque_wms(codigo_produto, numero_lote);
CREATE INDEX IF NOT EXISTS idx_wms_endereco ON public.omni_estoque_wms(codigo_endereco);

-- 6. TABELA DE ENGENHARIA / FICHA TÉCNICA (BOM) - PRODUTO ACABADO (-PA) X INSUMOS
CREATE TABLE IF NOT EXISTS public.omni_fichas_tecnicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_pa VARCHAR(50) UNIQUE NOT NULL, -- Ex: 'LUM-LED-150W-PA'
    nome_pa VARCHAR(255) NOT NULL,
    unidade_pa VARCHAR(10) DEFAULT 'UN',
    tempo_estimado_min INT DEFAULT 30,
    custo_estimado NUMERIC(15, 2) DEFAULT 0.00,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.omni_fichas_tecnicas_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ficha_id UUID REFERENCES public.omni_fichas_tecnicas(id) ON DELETE CASCADE,
    codigo_insumo VARCHAR(50) NOT NULL,
    descricao_insumo VARCHAR(255) NOT NULL,
    unidade_insumo VARCHAR(10) NOT NULL,
    quantidade_necessaria NUMERIC(12, 4) NOT NULL,
    percentual_perda NUMERIC(5, 2) DEFAULT 0.00
);
CREATE INDEX IF NOT EXISTS idx_bom_ficha ON public.omni_fichas_tecnicas_itens(ficha_id);

-- 7. TABELA DE ORDENS DE PRODUÇÃO (CHÃO DE FÁBRICA)
CREATE TABLE IF NOT EXISTS public.omni_ordens_producao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_op VARCHAR(30) UNIQUE NOT NULL, -- Ex: 'OP-2026-0042'
    codigo_pa VARCHAR(50) NOT NULL,
    descricao_pa VARCHAR(255) NOT NULL,
    quantidade_planejada NUMERIC(12, 2) NOT NULL,
    quantidade_produzida NUMERIC(12, 2) DEFAULT 0.00,
    lote_gerado_pa VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PLANEJADA', -- 'PLANEJADA', 'EM_PRODUCAO', 'FINALIZADA', 'CANCELADA'
    sincronizado_sienge BOOLEAN DEFAULT FALSE,
    data_inicio TIMESTAMP WITH TIME ZONE,
    data_conclusao TIMESTAMP WITH TIME ZONE,
    operador_responsavel VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. FILA DE MENSAGERIA ASSÍNCRONA PARA O SIENGE ERP (TOLERÂNCIA A FALHAS)
CREATE TABLE IF NOT EXISTS public.omni_sienge_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_evento VARCHAR(50) NOT NULL, -- 'ENTRADA_NF', 'BAIXA_INSUMO_OP', 'ENTRADA_PA_OP', 'SAIDA_VENDA'
    payload JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDENTE', -- 'PENDENTE', 'ENVIADO', 'FALHA_RETRY'
    tentativas INT DEFAULT 0,
    resposta_sienge TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_sienge_queue_status ON public.omni_sienge_queue(status);
