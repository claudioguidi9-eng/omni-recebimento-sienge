const https = require('https');

const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
const SIENGE_BASE_URL = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1';

function siengeGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(SIENGE_BASE_URL + path, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + SIENGE_AUTH,
        'Accept': 'application/json',
        'User-Agent': 'OmniFiscalAI/3.0'
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
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

  const limit = Math.min(parseInt((req.query && req.query.limit) || '60', 10) || 60, 100);
  const offset = parseInt((req.query && req.query.offset) || '0', 10) || 0;
  const includeClosed = req.query && (req.query.all === '1' || req.query.includeClosed === 'true');
  const search = String((req.query && req.query.search) || '').trim().toUpperCase();

  try {
    const sRes = await siengeGet(`/purchase-orders?limit=${limit}&offset=${offset}`);
    if (sRes.status !== 200 || !sRes.data) {
      res.status(sRes.status || 500).json({
        ok: false,
        error: 'Falha ao consultar pedidos no Sienge ERP.',
        details: sRes.data
      });
      return;
    }

    const rawList = Array.isArray(sRes.data.results)
      ? sRes.data.results
      : (Array.isArray(sRes.data) ? sRes.data : []);

    // Filtra apenas pedidos reais em aberto (PENDING ou PARTIALLY_DELIVERED) e não reprovados
    let filtered = rawList.filter(ord => {
      if (!ord || !ord.id) return false;
      if (!includeClosed) {
        if (ord.status === 'FULLY_DELIVERED' || ord.status === 'CANCELED') return false;
        if (ord.disapproved === true) return false;
      }
      if (search) {
        const hay = `${ord.id} ${ord.formattedPurchaseOrderId || ''} ${ord.buyerId || ''} ${ord.notes || ''} ${ord.buildingId || ''} ${ord.supplierId || ''} ${ord.totalAmount || ''}`.toUpperCase();
        return hay.includes(search);
      }
      return true;
    });

    // Ordena do mais recente (maior ID) para o mais antigo
    filtered.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    res.status(200).json({
      ok: true,
      syncedAt: new Date().toISOString(),
      totalSiengeCount: sRes.data.resultSetMetadata?.count || rawList.length,
      totalOpen: filtered.length,
      results: filtered
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, results: [] });
  }
};
