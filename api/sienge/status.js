
const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
  const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
  const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
  const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
  const url = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1/purchase-orders?limit=1';

  try {
    const siengeReq = https.get(url, {
      headers: {
        'Authorization': 'Basic ' + SIENGE_AUTH,
        'Accept': 'application/json',
        'User-Agent': 'OmniFiscalAI/2.0'
      },
      timeout: 10000
    }, (sRes) => {
      let data = '';
      sRes.on('data', chunk => data += chunk);
      sRes.on('end', () => {
        res.status(200).json({
          online: true,
          subdomain: SIENGE_SUBDOMAIN,
          user: SIENGE_USER,
          siengeHttpStatus: sRes.statusCode,
          database: 'Supabase Cloud (omni_audit_logs)',
          deployedOn: 'Vercel Serverless',
          timestamp: new Date().toISOString()
        });
      });
    });
    siengeReq.on('error', (e) => {
      res.status(500).json({ online: false, error: e.message });
    });
  } catch (err) {
    res.status(500).json({ online: false, error: err.message });
  }
};
