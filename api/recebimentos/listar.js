
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';

  const limit = (req.query && req.query.limit) || '50';
  const url = SUPABASE_URL + '/rest/v1/omni_audit_logs?category=eq.recebimento_fiscal&order=timestamp.desc&limit=' + limit;

  try {
    const sRes = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });

    const rows = await sRes.json();
    const formatted = Array.isArray(rows) ? rows.map(r => {
      let parsed = {};
      try { parsed = typeof r.details === 'string' ? JSON.parse(r.details) : r.details; } catch(e) {}
      return {
        id: r.id,
        timestamp: r.timestamp,
        actor: r.actor,
        action: r.action,
        target: r.target,
        level: r.level,
        details: parsed
      };
    }) : [];

    res.status(200).json({
      total: formatted.length,
      registros: formatted
    });
  } catch (err) {
    res.status(500).json({ error: err.message, total: 0, registros: [] });
  }
};
