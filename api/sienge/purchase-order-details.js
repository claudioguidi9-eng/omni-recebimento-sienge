const https = require('https');

const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
const SIENGE_BASE_URL = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1';

function siengeReq(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(SIENGE_BASE_URL + path, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + SIENGE_AUTH,
        'Accept': 'application/json',
        'User-Agent': 'OmniFiscalAI/2.0'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TIMEOUT_SIENGE_API'));
    });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const orderId = (req.query && (req.query.id || req.query.orderId || req.query.pedido)) || '';
  const cleanId = String(orderId).replace(/\D/g, '');

  if (!cleanId) {
    res.status(400).json({ success: false, error: 'ID do Pedido de Compra não informado.' });
    return;
  }

  try {
    // 1. Buscar cabeçalho do pedido
    const orderRes = await siengeReq('/purchase-orders/' + cleanId);
    if (orderRes.status === 404 || !orderRes.data || !orderRes.data.id) {
      res.status(404).json({
        success: false,
        error: `Pedido #${cleanId} não foi encontrado no Sienge ERP (omnitrade).`,
        status: orderRes.status
      });
      return;
    }

    if (orderRes.status !== 200) {
      res.status(orderRes.status).json({
        success: false,
        error: `Erro ao consultar Sienge ERP: HTTP ${orderRes.status}`,
        details: orderRes.data
      });
      return;
    }

    const orderData = orderRes.data;

    // 2. Buscar itens do pedido e ordenar por itemNumber
    let items = [];
    try {
      const itemsRes = await siengeReq('/purchase-orders/' + cleanId + '/items');
      if (itemsRes.status === 200 && itemsRes.data) {
        items = Array.isArray(itemsRes.data.results) ? itemsRes.data.results : (Array.isArray(itemsRes.data) ? itemsRes.data : []);
      }
    } catch(errItems) {
      console.warn('Erro ao buscar itens do pedido ' + cleanId + ':', errItems.message);
    }

    items.sort((a, b) => Number(a.itemNumber || 0) - Number(b.itemNumber || 0));

    // 3. Buscar saldos de entrega (delivery-schedules) em paralelo para saber o saldo em aberto real no Sienge
    const enrichedItems = await Promise.all(items.map(async (it) => {
      let deliveredQty = 0;
      let openQty = Number(it.quantity || 0);
      try {
        const schedRes = await siengeReq(`/purchase-orders/${cleanId}/items/${it.itemNumber}/delivery-schedules`);
        const schedules = (schedRes.status === 200 && schedRes.data && Array.isArray(schedRes.data.results))
          ? schedRes.data.results
          : [];
        if (schedules.length > 0) {
          deliveredQty = schedules.reduce((acc, s) => acc + Number(s.deliveredQuantity || 0), 0);
          openQty = schedules.reduce((acc, s) => acc + Number(s.openQuantity != null ? s.openQuantity : (Number(s.sheduledQuantity || it.quantity || 0) - Number(s.deliveredQuantity || 0))), 0);
        }
      } catch (e) {}

      const baseDesc = it.resourceDescription || 'Material/Serviço';
      const detDesc = (it.detailDescription || '').trim();
      const fullDesc = detDesc ? `${baseDesc} - ${detDesc}` : baseDesc;

      return {
        itemNumber: it.itemNumber,
        resourceId: it.resourceId,
        resourceCode: it.resourceCode || '',
        resourceDescription: baseDesc,
        detailId: it.detailId || null,
        detailDescription: detDesc,
        fullDescription: fullDesc,
        unitOfMeasure: it.unitOfMeasure || 'UN',
        quantity: Number(it.quantity || 0),
        deliveredQuantity: deliveredQty,
        openQuantity: openQty,
        unitPrice: Number(it.unitPrice || 0),
        netPrice: Number(it.netPrice || 0),
        notes: it.notes || ''
      };
    }));

    res.status(200).json({
      success: true,
      order: {
        id: orderData.id,
        formattedId: orderData.formattedPurchaseOrderId || String(orderData.id),
        status: orderData.status,
        date: orderData.date,
        createdAt: orderData.createdAt,
        totalAmount: orderData.totalAmount || 0,
        supplierId: orderData.supplierId,
        buildingId: orderData.buildingId,
        buyerId: orderData.buyerId || 'N/A',
        notes: orderData.notes || '',
        paymentCondition: orderData.paymentCondition || '',
        consistent: orderData.consistent,
        authorized: orderData.authorized,
        disapproved: orderData.disapproved,
        freightType: orderData.freightType
      },
      items: enrichedItems
    });
  } catch(err) {
    res.status(500).json({
      success: false,
      error: 'Falha na comunicação com o Sienge ERP: ' + err.message
    });
  }
};
