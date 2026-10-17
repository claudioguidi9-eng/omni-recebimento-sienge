
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Exemplos e notas prontas para testes online na Vercel
  const demoFiles = [
    {
      filename: '35261012345678000199550010000456121894236123-nfe.xml',
      chave: '35261012345678000199550010000456121894236123',
      nNF: '45612',
      emitente: 'GERDAU ACOMINAS S.A.',
      vNF: '14500.00',
      pedido: 'PED-2026-8841',
      itens: [
        { cod: 'ACO-001', desc: 'VIGA ACO W 200X22.5 - 12 METROS', un: 'BARRA', qtd: 1500, ncm: '72163300' },
        { cod: 'ACO-002', desc: 'VERGALHAO CA50 10.0MM NERVURADO', un: 'BARRA', qtd: 800, ncm: '72142000' }
      ]
    },
    {
      filename: '35261098765432000188550010000881921498172635-nfe.xml',
      chave: '35261098765432000188550010000881921498172635',
      nNF: '88192',
      emitente: 'VOTORANTIM CIMENTOS S.A.',
      vNF: '19600.00',
      pedido: 'PED-2026-8910',
      itens: [
        { cod: 'CIM-001', desc: 'CIMENTO PORTLAND CP II-F-32 50KG', un: 'SACO', qtd: 500, ncm: '25232910' },
        { cod: 'CIM-002', desc: 'ARGAMASSA AC-III CINZA 20KG', un: 'SACO', qtd: 200, ncm: '38245000' }
      ]
    }
  ];

  res.status(200).json({
    total: demoFiles.length,
    files: demoFiles
  });
};
