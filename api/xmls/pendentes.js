const fs = require('fs');
const path = require('path');

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
      filename: '35503082240009668000114000000000001126119045082828.xml',
      chave: '35503082240009668000114000000000001126119045082828',
      nNF: '11',
      serie: '70000',
      isNfse: true,
      emitente: '40.009.668 TEREZA IVAN PONTES LIMA',
      vNF: '4200.00',
      pedido: '3565',
      itens: [
        { cod: '010701', desc: 'PRESTAÇÃO DE SERVIÇO - SUPORTE INFRA', un: 'VB', qtdNota: 1, ncm: '010701' }
      ]
    },
    {
      filename: '35261012345678000199550010000456121894236123-nfe.xml',
      chave: '35261012345678000199550010000456121894236123',
      nNF: '45612',
      serie: '1',
      isNfse: false,
      emitente: 'GERDAU ACOMINAS S.A.',
      vNF: '14500.00',
      pedido: '8841',
      itens: [
        { cod: 'ACO-001', desc: 'VIGA ACO W 200X22.5 - 12 METROS', un: 'BARRA', qtdNota: 1500, ncm: '72163300' },
        { cod: 'ACO-002', desc: 'VERGALHAO CA50 10.0MM NERVURADO', un: 'BARRA', qtdNota: 800, ncm: '72142000' }
      ]
    },
    {
      filename: '35261098765432000188550010000881921498172635-nfe.xml',
      chave: '35261098765432000188550010000881921498172635',
      nNF: '88192',
      serie: '1',
      isNfse: false,
      emitente: 'VOTORANTIM CIMENTOS S.A.',
      vNF: '19600.00',
      pedido: '8910',
      itens: [
        { cod: 'CIM-001', desc: 'CIMENTO PORTLAND CP II-F-32 50KG', un: 'SACO', qtdNota: 400, ncm: '25232910' },
        { cod: 'ARG-002', desc: 'ARGAMASSA AC-III CINZA 20KG', un: 'SACO', qtdNota: 200, ncm: '38245000' }
      ]
    },
    {
      filename: '35261034028316000103550010000035381001234567-nfe.xml',
      chave: '35261034028316000103550010000035381001234567',
      nNF: '99120',
      serie: '1',
      isNfse: false,
      emitente: 'DISTRIBUIDORA DE SUPRIMENTOS E EMBALAGENS LTDA',
      vNF: '2673.54',
      pedido: '3538',
      itens: [
        { cod: '776', desc: 'SACO DE LIXO 100LT REFORCADO', un: 'UN', qtdNota: 400, ncm: '39232190' },
        { cod: '778', desc: 'SACO DE LIXO 200LT EXTRA FORTE', un: 'UN', qtdNota: 200, ncm: '39232190' },
        { cod: '780', desc: 'DESINFETANTE HOSPITALAR 5 LITROS', un: 'GL', qtdNota: 50, ncm: '38089419' }
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
    success: true,
    total: filtered.length,
    files: filtered
  });
};
