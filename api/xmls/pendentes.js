module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const querySearch = String((req.query && (req.query.search || req.query.nf || req.query.numero)) || '').trim().replace(/^0+/, '');

  // Exemplos e notas prontas para testes online na Vercel
  const demoFiles = [
    {
      filename: '35261001637895000132550010000489121899210042-nfe.xml',
      chave: '35261001637895000132550010000489121899210042',
      nNF: '48912',
      emitente: 'VOTORANTIM CIMENTOS S.A.',
      vNF: '19250.00',
      pedido: '3513',
      itens: [
        { cod: '1042', desc: 'CIMENTO PORTLAND CP-II-F-32 50KG', un: 'SC', qtdNota: 500, ncm: '25232910' },
        { cod: '1088', desc: 'CAL HIDRATADA CH-I 20KG', un: 'SC', qtdNota: 100, ncm: '25222000' }
      ]
    },
    {
      filename: '35261012345678000199550010000456121894236123-nfe.xml',
      chave: '35261012345678000199550010000456121894236123',
      nNF: '45612',
      emitente: 'GERDAU ACOMINAS S.A.',
      vNF: '14500.00',
      pedido: '3520',
      itens: [
        { cod: 'ACO-001', desc: 'VIGA ACO W 200X22.5 - 12 METROS', un: 'BARRA', qtdNota: 1500, ncm: '72163300' },
        { cod: 'ACO-002', desc: 'VERGALHAO CA50 10.0MM NERVURADO', un: 'BARRA', qtdNota: 800, ncm: '72142000' }
      ]
    },
    {
      filename: '35261098765432000188550010000881921498172635-nfe.xml',
      chave: '35261098765432000188550010000881921498172635',
      nNF: '88192',
      emitente: 'VOTORANTIM CIMENTOS S.A.',
      vNF: '19600.00',
      pedido: '3513',
      itens: [
        { cod: 'CIM-001', desc: 'CIMENTO PORTLAND CP II-F-32 50KG', un: 'SACO', qtdNota: 500, ncm: '25232910' },
        { cod: 'CIM-002', desc: 'ARGAMASSA AC-III CINZA 20KG', un: 'SACO', qtdNota: 200, ncm: '38245000' }
      ]
    },
    {
      filename: '35261005544332000111550010000129031122334455-nfe.xml',
      chave: '35261005544332000111550010000129031122334455',
      nNF: '12903',
      emitente: 'QUARTZOLIT SAINT-GOBAIN DO BRASIL',
      vNF: '18545.00',
      pedido: '3528',
      itens: [
        { cod: '3015', desc: 'ARGAMASSA AC-III CINZA 20KG', un: 'SC', qtdNota: 300, ncm: '38245000' },
        { cod: '3022', desc: 'REJUNTE RESINADO CINZA 1KG', un: 'PCT', qtdNota: 150, ncm: '32149000' },
        { cod: '3040', desc: 'IMPERMEABILIZANTE VEDACIT 18L', un: 'BD', qtdNota: 40, ncm: '27150000' }
      ]
    }
  ];

  let filtered = demoFiles;
  if (querySearch) {
    filtered = demoFiles.filter(f => {
      const cleanF = f.nNF.replace(/^0+/, '');
      return cleanF === querySearch || f.nNF.includes(querySearch) || f.chave.includes(querySearch) || f.filename.includes(querySearch);
    });
  }

  res.status(200).json({
    total: filtered.length,
    files: filtered
  });
};
