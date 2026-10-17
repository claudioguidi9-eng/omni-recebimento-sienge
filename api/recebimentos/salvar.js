
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = req.body || {};
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';

  const logRecord = {
    id: 'rec-' + Date.now() + '-' + Math.floor(Math.random()*1000),
    timestamp: new Date().toISOString(),
    actor: payload.conferente || 'Conferente Omni Trade',
    category: 'recebimento_fiscal',
    action: payload.action || 'RECEBIMENTO_CONCLUIDO',
    target: 'NF ' + (payload.numeroNf || 'N/A') + ' / ' + (payload.fornecedor || 'Fornecedor'),
    details: typeof payload.details === 'string' ? payload.details : JSON.stringify(payload),
    level: payload.action === 'RECEBIMENTO_BLOQUEADO_DIVERGENCIA' ? 'error' : 'info'
  };

  try {
    const sRes = await fetch(SUPABASE_URL + '/rest/v1/omni_audit_logs', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(logRecord)
    });

    const inserted = await sRes.json();
    res.status(201).json({
      success: true,
      id: logRecord.id,
      timestamp: logRecord.timestamp,
      data: inserted
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
