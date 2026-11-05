const https = require('https');

const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
const SIENGE_BASE_URL = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1';

function siengeReq(method, path) {
  return new Promise((resolve) => {
    try {
      const req = https.request(SIENGE_BASE_URL + path, {
        method: method,
        headers: {
          'Authorization': 'Basic ' + SIENGE_AUTH,
          'Accept': 'application/json',
          'User-Agent': 'OmniFiscalAI/3.0'
        },
        timeout: 15000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} });
          } catch (e) {
            resolve({ status: res.statusCode, data: d });
          }
        });
      });
      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 504, error: 'TIMEOUT_SIENGE_API' });
      });
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}

const BANCOS_BRASIL = {
  '001': 'Banco do Brasil S.A.',
  '033': 'Banco Santander (Brasil) S.A.',
  '104': 'Caixa Econômica Federal',
  '237': 'Banco Bradesco S.A.',
  '341': 'Banco Itaú Unibanco S.A.',
  '389': 'Banco Mercantil do Brasil S.A.',
  '422': 'Banco Safra S.A.',
  '748': 'Banco Cooperativo Sicredi S.A.',
  '756': 'Bancoob (Banco Cooperativo do Brasil / Sicoob)',
  '077': 'Banco Inter S.A.',
  '260': 'Nu Pagamentos S.A. (Nubank)',
  '212': 'Banco Original S.A.',
  '655': 'Banco Votorantim S.A.',
  '208': 'Banco BTG Pactual S.A.',
  '041': 'Banco do Estado do Rio Grande do Sul (Banrisul)',
  '070': 'Banco de Brasília (BRB)'
};

function modulo10Febraban(bloco) {
  let soma = 0, peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let mult = parseInt(bloco[i], 10) * peso;
    if (mult > 9) mult = Math.floor(mult / 10) + (mult % 10);
    soma += mult;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

function bar44ToDig47(bar) {
  bar = bar.replace(/\D/g, '');
  if (bar.length !== 44) return '';
  const b1 = bar.substring(0, 4);
  const dvGeral = bar.substring(4, 5);
  const fatorValor = bar.substring(5, 19);
  const cl1 = bar.substring(19, 24);
  const cl2 = bar.substring(24, 34);
  const cl3 = bar.substring(34, 44);

  const campo1 = b1 + cl1;
  const dv1 = modulo10Febraban(campo1);
  const campo2 = cl2;
  const dv2 = modulo10Febraban(campo2);
  const campo3 = cl3;
  const dv3 = modulo10Febraban(campo3);

  return campo1 + dv1 + campo2 + dv2 + campo3 + dv3 + dvGeral + fatorValor;
}

function dig47ToBar44(dig) {
  dig = dig.replace(/\D/g, '');
  if (dig.length !== 47) return '';
  const b1 = dig.substring(0, 4);
  const dvGeral = dig.substring(32, 33);
  const fatorValor = dig.substring(33, 47);
  const campoLivre = dig.substring(4, 9) + dig.substring(10, 20) + dig.substring(21, 31);
  return b1 + dvGeral + fatorValor + campoLivre;
}

function calcularVencimentoFatorFebraban(fatorStr) {
  const fator = parseInt(fatorStr, 10);
  if (isNaN(fator) || fator < 1000) return null;
  let dt;
  if (fator >= 1000 && fator <= 5500) {
    const baseCiclo2 = new Date(Date.UTC(2025, 1, 22));
    const dias = fator - 1000;
    dt = new Date(baseCiclo2.getTime() + dias * 86400000);
  } else {
    const baseCiclo1 = new Date(Date.UTC(1997, 9, 7));
    dt = new Date(baseCiclo1.getTime() + fator * 86400000);
  }
  return dt.toISOString().slice(0, 10);
}

function formatarLinhaDigitavel(dig) {
  dig = String(dig || '').replace(/\D/g, '');
  if (dig.length === 47) {
    return `${dig.slice(0, 5)}.${dig.slice(5, 10)} ${dig.slice(10, 15)}.${dig.slice(15, 21)} ${dig.slice(21, 26)}.${dig.slice(26, 32)} ${dig.slice(32, 33)} ${dig.slice(33, 47)}`;
  }
  if (dig.length === 48) {
    return `${dig.slice(0, 12)} ${dig.slice(12, 24)} ${dig.slice(24, 36)} ${dig.slice(36, 48)}`;
  }
  return dig;
}

function extrairTextoDeBase64Pdf(base64Str) {
  try {
    const buf = Buffer.from(base64Str, 'base64');
    const str = buf.toString('latin1');
    const chunks = [];
    const textMatches = str.match(/\((?:[^()\\]|\\.)*\)[\s]*T[jJ]/g) || [];
    for (const m of textMatches) {
      const inside = m.replace(/\\([()\\])/g, '$1').replace(/^\(/, '').replace(/\)[\s]*T[jJ]$/, '');
      if (inside) chunks.push(inside);
    }
    const btMatches = str.match(/BT[\s\S]*?ET/g) || [];
    for (const bt of btMatches) {
      const parts = bt.match(/\((?:[^()\\]|\\.)*\)/g) || [];
      for (const p of parts) {
        chunks.push(p.replace(/^\(/, '').replace(/\)$/, ''));
      }
    }
    return chunks.join(' ') || str.replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ');
  } catch (e) {
    return '';
  }
}

function analisarTextoBoleto(text) {
  const clean = text.replace(/[\r\n]+/g, ' ');
  let digitableLine47 = '';
  let barcode44 = '';
  let tipoBoleto = 'COBRANCA';

  // 1. Localizar Linha Digitável com pontuação (47 dígitos padrão FEBRABAN)
  const fmtMatch = clean.match(/\b(\d{5})[\.\s]?(\d{5})\s*(\d{5})[\.\s]?(\d{6})\s*(\d{5})[\.\s]?(\d{6})\s*(\d{1})\s*(\d{14})\b/);
  if (fmtMatch) {
    digitableLine47 = fmtMatch[1] + fmtMatch[2] + fmtMatch[3] + fmtMatch[4] + fmtMatch[5] + fmtMatch[6] + fmtMatch[7] + fmtMatch[8];
  } else {
    // 47 dígitos contínuos
    const raw47 = clean.match(/\b\d{47}\b/);
    if (raw47) {
      digitableLine47 = raw47[0];
    } else {
      // 48 dígitos (Concessionária / Tributos)
      const raw48 = clean.match(/\b\d{48}\b/);
      if (raw48) {
        digitableLine47 = raw48[0];
        tipoBoleto = 'CONCESSIONARIA_TRIBUTO';
      } else {
        // 44 dígitos (Código de Barras nativo)
        const raw44 = clean.match(/\b\d{44}\b/);
        if (raw44) {
          barcode44 = raw44[0];
          digitableLine47 = bar44ToDig47(barcode44);
        }
      }
    }
  }

  // Se tem linha de 47, deriva o código de barras de 44
  if (digitableLine47.length === 47 && !barcode44) {
    barcode44 = dig47ToBar44(digitableLine47);
  }

  // 2. Banco Emissor
  let codBanco = '';
  let nomeBanco = 'Banco Não Identificado';
  if (digitableLine47.length >= 3) {
    codBanco = digitableLine47.substring(0, 3);
    nomeBanco = BANCOS_BRASIL[codBanco] || `Banco Código ${codBanco}`;
  }

  // 3. Valor
  let valor = 0;
  if (digitableLine47.length === 47) {
    const valCentavos = parseInt(digitableLine47.slice(-10), 10);
    if (!isNaN(valCentavos) && valCentavos > 0) {
      valor = valCentavos / 100;
    }
  }
  if (!valor) {
    const valTextMatch = clean.match(/(?:Valor(?:\s*do\s*Documento)?|Total\s*a\s*Pagar|Valor\s*Cobrado)[\s\:\$R]*([0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2})/i);
    if (valTextMatch) {
      valor = parseFloat(valTextMatch[1].replace(/\./g, '').replace(',', '.'));
    }
  }

  // 4. Data de Vencimento
  let vencimento = '';
  if (digitableLine47.length === 47) {
    const fatorStr = digitableLine47.substring(33, 37);
    vencimento = calcularVencimentoFatorFebraban(fatorStr);
  }
  if (!vencimento) {
    const vencTextMatch = clean.match(/(?:Vencimento|Data\s*de\s*Vencimento)[\s\:]*([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})/i);
    if (vencTextMatch) {
      const parts = vencTextMatch[1].split(/[\/\-\.]/);
      vencimento = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  // 5. CNPJs
  const cnpjs = clean.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2}\b/g) || [];
  let cnpjBeneficiario = '';
  let cnpjPagador = '';

  for (const c of cnpjs) {
    if (c === '34.028.316/0001-03') {
      cnpjPagador = c;
    } else if (!cnpjBeneficiario) {
      cnpjBeneficiario = c;
    } else if (!cnpjPagador) {
      cnpjPagador = c;
    }
  }

  // 6. Beneficiário / Razão Social
  let beneficiario = '';
  const benMatch = clean.match(/(?:Benefici[áa]rio|Cedente|Raz[ãa]o\s*Social|Favorecido)[\s\:\-]*([A-Z0-9\.\-\s]{4,60}?)(?:CNPJ|CPF|Endere|Ag[êe]ncia|Nosso|Data|$)/i);
  if (benMatch) {
    beneficiario = benMatch[1].trim().replace(/\s+/g, ' ');
  }

  // 7. Número do Documento / NF / Seu Número
  let docNumero = '';
  const docMatch = clean.match(/(?:N[úu]mero\s*do\s*Documento|Nº\s*do\s*Doc(?:umento)?|Nº\s*Doc|Seu\s*N[úu]mero)[\s\:\-]*([a-zA-Z0-9\/\-\.\s]{1,30}?)(?:\s+(?:Esp[ée]cie|Data|Aceite|Uso|Carteira|Valor|Vencimento|\n|\r|$))/i) ||
                   clean.match(/(?:N[úu]mero\s*do\s*Documento|Nº\s*do\s*Doc(?:umento)?|Nº\s*Doc|Seu\s*N[úu]mero)[\s\:\-]*([a-zA-Z0-9\/\-\.]+)/i);
  if (docMatch) {
    docNumero = docMatch[1].trim();
  }

  return {
    ok: Boolean(digitableLine47 || barcode44),
    tipoBoleto,
    codBanco,
    nomeBanco,
    barcode44,
    digitableLine47,
    digitableLineFormatada: formatarLinhaDigitavel(digitableLine47),
    valor,
    valorFormatado: Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    vencimento,
    vencimentoFormatado: vencimento ? vencimento.split('-').reverse().join('/') : '',
    beneficiario,
    cnpjBeneficiario,
    cnpjPagador,
    docNumero
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    let rawText = body.text || '';
    if (!rawText && body.base64) {
      rawText = extrairTextoDeBase64Pdf(body.base64);
    }

    if (!rawText && !body.barcode && !body.digitable) {
      res.status(400).json({ error: 'Nenhum texto, base64 ou código informado para análise do boleto.' });
      return;
    }

    if (body.digitable || body.barcode) {
      rawText += ' ' + (body.digitable || '') + ' ' + (body.barcode || '');
    }

    const resultado = analisarTextoBoleto(rawText);

    // Cruzar automaticamente com Títulos no Sienge (/bills) se houver valor ou docNumero
    let siengeMatch = null;
    try {
      const billsRes = await siengeReq('GET', '/bills?startDate=2025-01-01&endDate=2026-12-31&limit=30&offset=0');
      if (billsRes.status === 200 && Array.isArray(billsRes.data?.results)) {
        const docLimpo = resultado.docNumero ? resultado.docNumero.replace(/\D/g, '') : '';
        const match = billsRes.data.results.find(b => {
          if (docLimpo && String(b.documentNumber || '').includes(docLimpo)) return true;
          if (resultado.valor > 0 && Math.abs((Number(b.totalInvoiceAmount) || 0) - resultado.valor) < 0.05) return true;
          return false;
        });
        if (match) {
          siengeMatch = {
            billId: match.id,
            installmentId: 1,
            documentNumber: match.documentNumber,
            purchaseOrderId: match.purchaseOrderId,
            totalInvoiceAmount: match.totalInvoiceAmount,
            issueDate: match.issueDate
          };
        }
      }
    } catch (e) {}

    res.status(200).json({
      ok: resultado.ok,
      dadosBoleto: resultado,
      siengeMatch,
      message: resultado.ok
        ? `Boleto identificado com sucesso! Banco ${resultado.nomeBanco}, Valor ${resultado.valorFormatado}, Vencimento ${resultado.vencimentoFormatado}.`
        : 'Não foi possível detectar a Linha Digitável (47 dígitos) ou Código de Barras no arquivo. Você pode digitar ou colar manualmente.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar PDF do boleto: ' + err.message });
  }
};
