const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';
const STATE_RECORD_ID = 'omni-wms-pcp-dda-state-v2';

function supabaseReq(method, pathAndQuery, bodyObj, extraHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
      const u = new URL(SUPABASE_URL + pathAndQuery);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...extraHeaders
        },
        timeout: 10000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: d ? JSON.parse(d) : null });
          } catch (e) {
            resolve({ status: res.statusCode, data: d });
          }
        });
      });
      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      if (bodyStr) req.write(bodyStr);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
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

  if (req.method === 'GET') {
    const r = await supabaseReq('GET', `/rest/v1/omni_audit_logs?id=eq.${STATE_RECORD_ID}&limit=1`);
    if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
      try {
        const parsed = JSON.parse(r.data[0].details || '{}');
        res.status(200).json({ ok: true, updatedAt: r.data[0].timestamp, state: parsed });
        return;
      } catch (e) {}
    }
    res.status(200).json({ ok: true, state: null });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const payload = {
      id: STATE_RECORD_ID,
      timestamp: new Date().toLocaleString('pt-BR'),
      actor: body.actor || 'OmniTrade WMS & Fiscal Sync',
      category: 'wms_state_snapshot',
      action: body.action || 'Sincronização de Estado WMS / PCP / De-Para / DDA',
      target: 'Supabase Cloud Persistence',
      details: JSON.stringify(body.state || {}),
      level: 'info'
    };

    const upRes = await supabaseReq(
      'POST',
      '/rest/v1/omni_audit_logs',
      payload,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    );

    res.status(200).json({
      ok: upRes.status >= 200 && upRes.status < 300,
      supabaseStatus: upRes.status
    });
  }
};
