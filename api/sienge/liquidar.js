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
        'User-Agent': 'OmniFiscalAI/3.0',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      },
      timeout: 25000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} });
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
  const isNfse = Boolean(body.isNfse || body.documentId === 'NFSE');
  const rawSerie = String(body.serieNf || body.serie || (isNfse ? 'SU' : '1')).trim();
  // Sienge limita series em purchase-invoices a até 3 caracteres (ex: 'SU' para NFS-e, '1' para NF-e)
  const serieNf = isNfse ? (rawSerie.length <= 3 && rawSerie !== '70000' ? rawSerie : 'SU') : (rawSerie.slice(0, 3) || '1');
  const chaveNfe = body.chaveNfe || body.accessKeyNumber || '';
  const conferente = body.conferente || 'Conferente Omni Trade';
  const dataEmissao = body.dataEmissao || '';
  const fornecedor = body.fornecedor || '';
  const cnpjFornecedor = String(body.cnpj || '').replace(/\D/g, '');
  const itensRecebidos = Array.isArray(body.itensRecebidos) ? body.itensRecebidos : (Array.isArray(body.items) ? body.items : []);
  const duplicatas = Array.isArray(body.duplicatas) ? body.duplicatas : [];
  const impostos = body.impostos || {};
  const valorTotal = parseFloat(body.valorTotal || impostos.vNF || 0) || 0;
  const dadosFinanceiros = body.dadosFinanceiros || null;

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

    // 2. Criar a Nota Fiscal de Compra (purchase-invoices) com suporte a NF-e e NFS-e de Serviço
    const todayIso = new Date().toISOString().split('T')[0];
    const issueDateStr = (dataEmissao && dataEmissao.length === 10)
      ? dataEmissao
      : todayIso;

    const cleanNfNum = String(numeroNf || '').replace(/\D/g, '') || String(poId);
    const dupResumo = duplicatas.length > 0
      ? ' | Duplicatas: ' + duplicatas.map(d => `${d.nDup || d.numero || 1}:${d.dVenc || d.vencimento || ''}(R$${d.vDup || d.valor || valorTotal})`).join(', ')
      : (dadosFinanceiros && dadosFinanceiros.vencimento ? ` | Venc: ${dadosFinanceiros.vencimento} (${dadosFinanceiros.modalidade || 'Sem DDA'})` : '');

    const docTypeSienge = isNfse ? 'NFSE' : 'NFE';

    const invoicePayload = {
      notes: ((chaveNfe ? (`Chave ${docTypeSienge}: ` + chaveNfe) : `Recebimento OmniFiscal (${docTypeSienge})`) + dupResumo + ' | Conf: ' + conferente).substring(0, 500),
      supplierId: poData.supplierId,
      number: cleanNfNum,
      series: serieNf,
      companyId: poData.companyId || 1,
      documentId: docTypeSienge,
      issueDate: issueDateStr,
      movementDate: todayIso,
      accountingDate: todayIso,
      ...(valorTotal > 0 ? {
        itemsTotalAmount: valorTotal,
        ...(!isNfse ? {
          productsAmount: parseFloat(impostos.vProd || valorTotal) || valorTotal,
          eletronicInvoiceAmount: valorTotal
        } : {})
      } : {}),
      ...(parseFloat(impostos.vFrete) > 0 ? { freightAmount: parseFloat(impostos.vFrete) } : {}),
      ...(parseFloat(impostos.vDesc) > 0 ? { discount: parseFloat(impostos.vDesc) } : {}),
      ...(parseFloat(impostos.vIPI) > 0 ? { ipiTax: parseFloat(impostos.vIPI) } : {}),
      ...(parseFloat(impostos.vST) > 0 ? { icmsStTax: parseFloat(impostos.vST) } : {})
    };

    let sequentialNumber = null;
    let billIdGerado = poData.forecastBillId || null;

    // Verificar se já existe nota com esse número e fornecedor no Sienge
    const searchExisting = await siengeReq('GET', '/purchase-invoices?number=' + cleanNfNum + '&supplierId=' + poData.supplierId);
    if (searchExisting.status === 200 && searchExisting.data && Array.isArray(searchExisting.data.results) && searchExisting.data.results.length > 0) {
      const existingInv = searchExisting.data.results[0];
      sequentialNumber = existingInv.sequentialNumber;
      if (existingInv.billId) billIdGerado = existingInv.billId;
    }

    if (!sequentialNumber) {
      const invRes = await siengeReq('POST', '/purchase-invoices', invoicePayload);
      sequentialNumber = invRes.data && invRes.data.sequentialNumber;

      if (!sequentialNumber) {
        const searchInv = await siengeReq('GET', `/purchase-invoices?number=${cleanNfNum}&supplierId=${poData.supplierId}`);
        if (searchInv.status === 200 && searchInv.data && Array.isArray(searchInv.data.results) && searchInv.data.results.length > 0) {
          sequentialNumber = searchInv.data.results[0].sequentialNumber;
          if (searchInv.data.results[0].billId) billIdGerado = searchInv.data.results[0].billId;
        } else {
          res.status(invRes.status || 500).json({
            error: 'Falha ao registrar Nota Fiscal de Compra no Sienge ERP.',
            details: invRes.data
          });
          return;
        }
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
        let matchedEntries = itensRecebidos.filter(r =>
          r.itemNumber != null && Number(r.itemNumber) === Number(item.itemNumber)
        );

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

    // 4.1 Consultar a Nota Fiscal criada para obter o billId definitivo gerado pelo Sienge no Contas a Pagar
    try {
      const invDetailRes = await siengeReq('GET', `/purchase-invoices/${sequentialNumber}`);
      if (invDetailRes.status === 200 && invDetailRes.data && invDetailRes.data.billId) {
        billIdGerado = invDetailRes.data.billId;
      }
    } catch (e) {}

    // 4.2 Se houver Dados Financeiros informados (com ou sem DDA), atualizar o Título / Parcela no Sienge (/bills/{billId}/installments/1)
    let financeiroResult = null;
    if (billIdGerado && dadosFinanceiros) {
      try {
        const vencIso = dadosFinanceiros.vencimento || (duplicatas[0] && (duplicatas[0].dVenc || duplicatas[0].vencimento)) || '';
        const mod = dadosFinanceiros.modalidade || 'SEM_DDA_PIX';
        const obsFin = String(dadosFinanceiros.observacao || `Amarração Financeira ${docTypeSienge} ${cleanNfNum} • Pedido #${poId}`).substring(0, 450);

        let duePatchStatus = null;
        if (vencIso && /^\d{4}-\d{2}-\d{2}$/.test(vencIso)) {
          const patchDue = await siengeReq('PATCH', `/bills/${billIdGerado}/installments/1`, { dueDate: vencIso });
          duePatchStatus = patchDue.status;
        }

        let paymentPatchStatus = null;
        if (mod === 'SEM_DDA_PIX') {
          const chavePix = String(dadosFinanceiros.chavePix || cnpjFornecedor || '').trim();
          const tipoPix = dadosFinanceiros.tipoChavePix || (cnpjFornecedor ? 'C' : 'A');
          const pixRes = await siengeReq('PATCH', `/bills/${billIdGerado}/installments/1/payment-information/pix`, {
            paymentTypeId: 14,
            isUsingCreditorData: chavePix ? 'N' : 'S',
            beneficiaryName: String(fornecedor || '').substring(0, 80),
            ...(cnpjFornecedor.length === 11
              ? { beneficiaryCpfNumber: cnpjFornecedor }
              : cnpjFornecedor.length === 14
                ? { beneficiaryCnpjNumber: cnpjFornecedor }
                : {}),
            ...(chavePix ? { keyPixType: tipoPix, keyPix: chavePix } : {}),
            notes: obsFin
          });
          paymentPatchStatus = pixRes.status;
        } else if (mod === 'SEM_DDA_TED' || mod === 'SEM_DDA_TRANSFERENCIA') {
          const tedRes = await siengeReq('PATCH', `/bills/${billIdGerado}/installments/1/payment-information/bank-transfer`, {
            paymentTypeId: mod === 'SEM_DDA_TRANSFERENCIA' ? 3 : 6,
            beneficiaryName: String(fornecedor || '').substring(0, 80),
            ...(cnpjFornecedor.length === 14 ? { beneficiaryCNPJNumber: cnpjFornecedor } : {}),
            notes: obsFin
          });
          paymentPatchStatus = tedRes.status;
        }

        financeiroResult = {
          billId: billIdGerado,
          modalidade: mod,
          vencimento: vencIso,
          duePatchStatus,
          paymentPatchStatus
        };
      } catch (eFin) {
        financeiroResult = { billId: billIdGerado, error: eFin.message };
      }
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
          target: `${docTypeSienge} ${cleanNfNum} / Pedido #${poId}`,
          details: JSON.stringify({
            sequentialNumber,
            billId: billIdGerado,
            forecastBillId: poData.forecastBillId || null,
            documentId: docTypeSienge,
            purchaseOrderId: poId,
            statusAnterior: poData.status,
            novoStatusSienge: finalPoStatus,
            chaveNfe: chaveNfe || null,
            fornecedor: fornecedor || null,
            itensAtendidos: deliveriesOrder.length,
            entregasVinculadas: deliveriesOrder,
            itensSobraPedido,
            itensExcedentesNf,
            financeiroResult,
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
      message: `${docTypeSienge} ${cleanNfNum} integrada com sucesso! Pedido #${poId} atualizado no Sienge para ${finalPoStatus}.`,
      sequentialNumber,
      billId: billIdGerado,
      forecastBillId: poData.forecastBillId || null,
      documentId: docTypeSienge,
      purchaseOrderId: poId,
      statusAnterior: poData.status,
      novoStatusSienge: finalPoStatus,
      entregasVinculadas: deliveriesOrder,
      itensSobraPedido,
      itensExcedentesNf,
      financeiroResult
    });

  } catch(err) {
    res.status(500).json({
      error: 'Erro interno ao processar liquidação no Sienge: ' + err.message
    });
  }
};
