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

    // 3. Obter itens e entregas agendadas do pedido (com suporte a Atendimento Parcial por Item e por Quantidade)
    const itemsRes = await siengeReq('GET', '/purchase-orders/' + poId + '/items');
    const poItems = ((itemsRes.data && itemsRes.data.results) || []).sort(
      (a, b) => Number(a.itemNumber || 0) - Number(b.itemNumber || 0)
    );

    const deliveriesOrder = [];
    const itensSobraPedido = [];
    const itensExcedentesNf = [];
    const hasExplicitReceivedList = Array.isArray(itensRecebidos) && itensRecebidos.length > 0;

    for (const item of poItems) {
      const fullDesc = item.detailDescription
        ? `${item.resourceDescription || 'Insumo'} - ${item.detailDescription}`
        : (item.resourceDescription || 'Insumo');

      const schedRes = await siengeReq('GET', `/purchase-orders/${poId}/items/${item.itemNumber}/delivery-schedules`);
      const schedules = (schedRes.data && schedRes.data.results) || [];
      const totalOpenInPo = schedules.length > 0
        ? schedules.reduce((acc, s) => acc + Number(s.openQuantity != null ? s.openQuantity : (s.sheduledQuantity || item.quantity || 0)), 0)
        : Number(item.quantity || 0);

      let targetQty = 0;

      if (hasExplicitReceivedList) {
        // Prioridade 1: Match estrito pelo itemNumber do Pedido Sienge (evita colisão quando vários itens têm mesmo resourceId, ex: Botinas TAM 37..43)
        let matchedEntries = itensRecebidos.filter(r =>
          r.itemNumber != null && Number(r.itemNumber) === Number(item.itemNumber)
        );

        // Prioridade 2: Apenas para entradas sem itemNumber definido, tenta casar por detailId ou resourceId único no pedido
        if (matchedEntries.length === 0) {
          const sameResourceCount = poItems.filter(
            p => String(p.resourceId || p.resourceCode).trim() === String(item.resourceId || item.resourceCode).trim()
          ).length;

          matchedEntries = itensRecebidos.filter(r => {
            if (r.itemNumber != null) return false;
            const rRes = String(r.resourceId || r.cod || '').trim();
            const iRes = String(item.resourceId || item.resourceCode || '').trim();
            if (!rRes || rRes !== iRes) return false;
            if (r.detailId != null && item.detailId != null) {
              return Number(r.detailId) === Number(item.detailId);
            }
            return sameResourceCount === 1;
          });
        }

        targetQty = matchedEntries.reduce((acc, r) => {
          const parsed = parseFloat(r.qtdSiengeConvertida ?? r.qtdDoca ?? r.qtdNfe ?? r.quantity ?? r.qtd ?? 0);
          return acc + (isNaN(parsed) ? 0 : parsed);
        }, 0);
      } else {
        targetQty = totalOpenInPo;
      }

      // Se o item do pedido NÃO veio na Nota Fiscal (ex: Pedido tem 4 ou 7 itens e a NF veio com apenas 3 ou 4 itens),
      // NÃO vincula entrega para este item -> mantém 100% do saldo em aberto no Sienge e no Omni!
      if (targetQty <= 0) {
        if (totalOpenInPo > 0) {
          itensSobraPedido.push({
            itemNumber: item.itemNumber,
            resourceId: item.resourceId,
            detailDescription: item.detailDescription || '',
            description: fullDesc,
            unitOfMeasure: item.unitOfMeasure || 'UN',
            qtdPedido: Number(item.quantity || 0),
            qtdAbertaAntes: totalOpenInPo,
            qtdAtendidaNestaNf: 0,
            saldoRemanescentePedido: totalOpenInPo,
            statusSaldo: 'ITEM_NAO_FATURADO_NA_NF'
          });
        }
        continue;
      }

      let remainingToDeliver = targetQty;
      let deliveredForThisItem = 0;

      if (schedules.length > 0) {
        for (const sc of schedules) {
          const maxOpen = (sc.openQuantity != null && sc.openQuantity > 0)
            ? Number(sc.openQuantity)
            : Number(sc.sheduledQuantity || item.quantity || 0);
          if (maxOpen <= 0 || remainingToDeliver <= 0) continue;

          const finalDelivered = Math.min(remainingToDeliver, maxOpen);
          if (finalDelivered > 0) {
            deliveriesOrder.push({
              purchaseOrderId: poId,
              itemNumber: item.itemNumber,
              deliveryScheduleNumber: sc.deliveryScheduleNumber || 1,
              deliveredQuantity: finalDelivered
            });
            deliveredForThisItem += finalDelivered;
            remainingToDeliver = Math.max(0, Number((remainingToDeliver - finalDelivered).toFixed(4)));
          }
        }
      } else {
        const maxOpen = Number(item.quantity || targetQty);
        const finalDelivered = Math.min(targetQty, maxOpen);
        deliveriesOrder.push({
          purchaseOrderId: poId,
          itemNumber: item.itemNumber,
          deliveryScheduleNumber: 1,
          deliveredQuantity: finalDelivered
        });
        deliveredForThisItem = finalDelivered;
        remainingToDeliver = Math.max(0, Number((targetQty - finalDelivered).toFixed(4)));
      }

      const saldoRestanteNoPedido = Math.max(0, Number((totalOpenInPo - deliveredForThisItem).toFixed(4)));
      if (saldoRestanteNoPedido > 0) {
        // Ex: Pedido pediu 4 e na NF vieram 3 -> fica 1 de saldo/sobra pendente no Pedido Sienge e no Omni
        itensSobraPedido.push({
          itemNumber: item.itemNumber,
          resourceId: item.resourceId,
          detailDescription: item.detailDescription || '',
          description: fullDesc,
          unitOfMeasure: item.unitOfMeasure || 'UN',
          qtdPedido: Number(item.quantity || 0),
          qtdAbertaAntes: totalOpenInPo,
          qtdAtendidaNestaNf: deliveredForThisItem,
          saldoRemanescentePedido: saldoRestanteNoPedido,
          statusSaldo: 'ATENDIDO_PARCIAL_COM_SALDO_NO_PEDIDO'
        });
      }

      if (remainingToDeliver > 0) {
        // Ex: NF veio com quantidade maior que o saldo do pedido
        itensExcedentesNf.push({
          itemNumber: item.itemNumber,
          resourceId: item.resourceId,
          description: fullDesc,
          qtdPedido: Number(item.quantity || 0),
          qtdNf: targetQty,
          qtdVinculadaSienge: deliveredForThisItem,
          excedenteSobrePedido: remainingToDeliver
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
    const finalPoStatus = poDataAfter.status || (itensSobraPedido.length > 0 ? 'PARTIALLY_DELIVERED' : 'FULLY_DELIVERED');

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
            novoStatusSienge: finalPoStatus,
            chaveNfe: chaveNfe || null,
            fornecedor: fornecedor || null,
            itensAtendidos: deliveriesOrder.length,
            entregasVinculadas: deliveriesOrder,
            itensSobraPedido,
            itensExcedentesNf,
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
      message: `NF-e ${cleanNfNum} integrada com sucesso! Pedido #${poId} atualizado no Sienge para ${finalPoStatus}.`,
      sequentialNumber,
      purchaseOrderId: poId,
      statusAnterior: poData.status,
      novoStatusSienge: finalPoStatus,
      entregasVinculadas: deliveriesOrder,
      itensSobraPedido,
      itensExcedentesNf
    });

  } catch(err) {
    res.status(500).json({
      error: 'Erro interno ao processar liquidação no Sienge: ' + err.message
    });
  }
};
