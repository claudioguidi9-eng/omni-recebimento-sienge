const https = require('https');

const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
const SIENGE_BASE_URL = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';

function siengeReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(SIENGE_BASE_URL + path, {
      method: method,
      headers: {
        'Authorization': 'Basic ' + SIENGE_AUTH,
        'Accept': 'application/json',
        'User-Agent': 'OmniFiscalAI/2.0',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      },
      timeout: 25000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch(e) {
          resolve({ status: res.statusCode, data: d });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TIMEOUT_SIENGE_API'));
    });
    if (data) req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { body = {}; }
  }
  body = body || {};

  const purchaseOrderId = body.purchaseOrderId || body.orderId;
  const numeroNf = body.numeroNf || body.nfeNumero;
  const serieNf = body.serieNf || body.serie || '1';
  const chaveNfe = body.chaveNfe || body.accessKeyNumber || '';
  const conferente = body.conferente || 'Conferente Omni Trade';
  const dataEmissao = body.dataEmissao || '';
  const fornecedor = body.fornecedor || '';
  const itensRecebidos = Array.isArray(body.itensRecebidos) ? body.itensRecebidos : (Array.isArray(body.items) ? body.items : []);
  const duplicatas = Array.isArray(body.duplicatas) ? body.duplicatas : [];
  const impostos = body.impostos || {};
  const valorTotal = parseFloat(body.valorTotal || impostos.vNF || 0) || 0;

  const poDigits = String(purchaseOrderId || '').replace(/\D/g, '');
  if (!poDigits) {
    res.status(400).json({ error: 'Número do Pedido de Compra Sienge inválido ou não informado.' });
    return;
  }
  const poId = parseInt(poDigits, 10);

  try {
    // 1. Consultar dados do Pedido no Sienge
    const poRes = await siengeReq('GET', '/purchase-orders/' + poId);
    if (poRes.status !== 200 || !poRes.data || !poRes.data.id) {
      res.status(404).json({
        error: `Pedido #${poId} não encontrado no Sienge ERP omnitrade.`,
        siengeStatus: poRes.status,
        siengeData: poRes.data
      });
      return;
    }
    const poData = poRes.data;

    // Se já estiver baixado/atendido integralmente
    if (poData.status === 'FULLY_DELIVERED') {
      res.status(200).json({
        success: true,
        alreadyDelivered: true,
        message: `O Pedido #${poId} já se encontra com status FULLY_DELIVERED (Atendido) no Sienge.`,
        purchaseOrderId: poId,
        poData
      });
      return;
    }

    // 2. Criar a Nota Fiscal de Compra (purchase-invoices) com Impostos e Duplicatas
    const todayIso = new Date().toISOString().split('T')[0];
    const issueDateStr = (dataEmissao && dataEmissao.length === 10)
      ? dataEmissao
      : todayIso;

    const cleanNfNum = String(numeroNf || '').replace(/\D/g, '') || String(poId);
    const cleanSerie = String(serieNf || '1').trim() || '1';
    const dupResumo = duplicatas.length > 0
      ? ' | Duplicatas XML: ' + duplicatas.map(d => `${d.nDup}:${d.dVenc}(R$${d.vDup})`).join(', ')
      : '';

    const invoicePayload = {
      notes: ((chaveNfe ? ('Chave NF-e: ' + chaveNfe) : 'Recebimento OmniFiscal AI') + dupResumo + ' | Conf: ' + conferente).substring(0, 500),
      supplierId: poData.supplierId,
      number: cleanNfNum,
      series: cleanSerie,
      companyId: poData.companyId || 1,
      documentId: 'NFE',
      issueDate: issueDateStr,
      movementDate: todayIso,
      accountingDate: todayIso,
      ...(valorTotal > 0 ? {
        itemsTotalAmount: valorTotal,
        productsAmount: parseFloat(impostos.vProd || valorTotal) || valorTotal,
        eletronicInvoiceAmount: valorTotal
      } : {}),
      ...(parseFloat(impostos.vFrete) > 0 ? { freightAmount: parseFloat(impostos.vFrete) } : {}),
      ...(parseFloat(impostos.vDesc) > 0 ? { discount: parseFloat(impostos.vDesc) } : {}),
      ...(parseFloat(impostos.vIPI) > 0 ? { ipiTax: parseFloat(impostos.vIPI) } : {}),
      ...(parseFloat(impostos.vST) > 0 ? { icmsStTax: parseFloat(impostos.vST) } : {})
    };

    // Verificar se já existe nota com esse número e fornecedor no Sienge para evitar rascunhos duplicados
    const searchExisting = await siengeReq('GET', '/purchase-invoices?number=' + cleanNfNum + '&supplierId=' + poData.supplierId);
    if (searchExisting.status === 200 && searchExisting.data && searchExisting.data.results && searchExisting.data.results.length > 0) {
      const validInv = searchExisting.data.results.find(i => i.consistency === 'N' || i.itemsTotalAmount > 0);
      if (validInv) {
        res.status(200).json({
          success: true,
          alreadyDelivered: true,
          message: 'A NF-e ' + cleanNfNum + ' já se encontra integrada no Sienge (Seq: ' + validInv.sequentialNumber + ', Total: R$ ' + validInv.itemsTotalAmount + ').',
          sequentialNumber: validInv.sequentialNumber,
          purchaseOrderId: poId
        });
        return;
      }
    }

    const invRes = await siengeReq('POST', '/purchase-invoices', invoicePayload);
    let sequentialNumber = invRes.data && invRes.data.sequentialNumber;

    if (!sequentialNumber) {
      // Se a nota já foi cadastrada anteriormente, buscar o sequentialNumber existente
      const searchInv = await siengeReq('GET', `/purchase-invoices?number=${cleanNfNum}&supplierId=${poData.supplierId}`);
      if (searchInv.status === 200 && searchInv.data && searchInv.data.results && searchInv.data.results.length > 0) {
        sequentialNumber = searchInv.data.results[0].sequentialNumber;
      } else {
        res.status(invRes.status || 500).json({
          error: 'Falha ao registrar Nota Fiscal de Compra no Sienge ERP.',
          details: invRes.data
        });
        return;
      }
    }

    // 3. Obter itens e entregas agendadas do pedido (com suporte a Atendimento Parcial)
    const itemsRes = await siengeReq('GET', '/purchase-orders/' + poId + '/items');
    const poItems = (itemsRes.data && itemsRes.data.results) || [];

    const deliveriesOrder = [];
    for (const item of poItems) {
      let targetQty = item.quantity || 1.0;

      // Se itensRecebidos foi passado, busca quantidade faturada/convertida nesta NF-e
      if (Array.isArray(itensRecebidos) && itensRecebidos.length > 0) {
        const found = itensRecebidos.find(r =>
          (r.cod && String(r.cod).trim() === String(item.resourceCode || item.resourceId).trim()) ||
          (r.resourceId && String(r.resourceId).trim() === String(item.resourceId).trim()) ||
          (r.itemNumber && Number(r.itemNumber) === Number(item.itemNumber))
        );
        if (found) {
          const parsedQty = parseFloat(found.qtdSiengeConvertida || found.qtdNfe || found.quantity || found.qtd);
          if (parsedQty > 0) targetQty = parsedQty;
        }
      }

      const schedRes = await siengeReq('GET', `/purchase-orders/${poId}/items/${item.itemNumber}/delivery-schedules`);
      const schedules = (schedRes.data && schedRes.data.results) || [];
      if (schedules.length > 0) {
        for (const sc of schedules) {
          const maxOpen = (sc.openQuantity > 0) ? sc.openQuantity : (sc.sheduledQuantity || item.quantity || 1.0);
          const finalDelivered = Math.min(targetQty, maxOpen);
          deliveriesOrder.push({
            purchaseOrderId: poId,
            itemNumber: item.itemNumber,
            deliveryScheduleNumber: sc.deliveryScheduleNumber || 1,
            deliveredQuantity: finalDelivered
          });
        }
      } else {
        deliveriesOrder.push({
          purchaseOrderId: poId,
          itemNumber: item.itemNumber,
          deliveryScheduleNumber: 1,
          deliveredQuantity: targetQty
        });
      }
    }

    // 4. Vincular entregas do Pedido à Nota Fiscal
    let linkRes = null;
    if (deliveriesOrder.length > 0) {
      linkRes = await siengeReq('POST', `/purchase-invoices/${sequentialNumber}/items/purchase-orders/delivery-schedules`, {
        deliveriesOrder
      });
    }

    // 5. Verificar novo status do Pedido no Sienge
    const poAfterRes = await siengeReq('GET', '/purchase-orders/' + poId);
    const poDataAfter = poAfterRes.data || {};

    // 6. Gravar Auditoria no Supabase Cloud
    try {
      await fetch(SUPABASE_URL + '/rest/v1/omni_audit_logs', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: 'sienge-liq-' + Date.now(),
          timestamp: new Date().toISOString(),
          actor: conferente || 'Conferente Omni Trade',
          category: 'recebimento_fiscal',
          action: 'RECEBIMENTO_SIENGE_LIQUIDADO',
          target: `NF ${cleanNfNum} / Pedido #${poId}`,
          details: JSON.stringify({
            sequentialNumber,
            purchaseOrderId: poId,
            statusAnterior: poData.status,
            novoStatusSienge: poDataAfter.status || 'FULLY_DELIVERED',
            chaveNfe: chaveNfe || null,
            fornecedor: fornecedor || null,
            itensAtendidos: deliveriesOrder.length,
            linkStatus: linkRes ? linkRes.status : 'N/A'
          }),
          level: 'info'
        })
      });
    } catch(e) {
      console.error('Erro ao gravar log Supabase:', e.message);
    }

    res.status(200).json({
      success: true,
      message: `NF-e ${cleanNfNum} integrada com sucesso! Pedido #${poId} atualizado no Sienge para ${poDataAfter.status || 'FULLY_DELIVERED'}.`,
      sequentialNumber,
      purchaseOrderId: poId,
      statusAnterior: poData.status,
      novoStatusSienge: poDataAfter.status || 'FULLY_DELIVERED',
      entregasVinculadas: deliveriesOrder
    });

  } catch(err) {
    res.status(500).json({
      error: 'Erro interno ao processar liquidação no Sienge: ' + err.message
    });
  }
};
