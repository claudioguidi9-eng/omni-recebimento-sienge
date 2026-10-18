module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = req.body || {};
  res.status(200).json({
    success: true,
    caminhoEntrada: payload.caminhoEntrada || 'C:\\D\\Omni\\XML_ENTRADA\\',
    caminhoLidos: payload.caminhoLidos || 'C:\\D\\Omni\\XML_LIDOS\\2026-10\\',
    total: 2,
    message: 'Caminho configurado com sucesso!'
  });
};
