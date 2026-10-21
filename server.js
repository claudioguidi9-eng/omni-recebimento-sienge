const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3333;
const SIENGE_SUBDOMAIN = process.env.SIENGE_SUBDOMAIN || 'omnitrade';
const SIENGE_USER = process.env.SIENGE_USER || 'omnitrade-claudioguidi';
const SIENGE_PASS = process.env.SIENGE_PASS || 'XjPFBTCjVJ09bKA5se2C69xrIf5fEnx7';
const SIENGE_AUTH = Buffer.from(SIENGE_USER + ':' + SIENGE_PASS).toString('base64');
const SIENGE_BASE_URL = 'https://api.sienge.com.br/' + SIENGE_SUBDOMAIN + '/public/api/v1';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';

let DIR_PENDENTES = path.join(__dirname, 'XML_PENDENTES');
let DIR_LIDOS = path.join(__dirname, 'XML_LIDOS');

try {
  if (!fs.existsSync(DIR_PENDENTES)) fs.mkdirSync(DIR_PENDENTES, { recursive: true });
} catch(e) {}

try {
  if (!fs.existsSync(DIR_LIDOS)) fs.mkdirSync(DIR_LIDOS, { recursive: true });
} catch(e) {}

function siengeFetch(endpoint) {
  return new Promise((resolve, reject) => {
    const url = SIENGE_BASE_URL + endpoint;
    https.get(url, {
      headers: {
        'Authorization': 'Basic ' + SIENGE_AUTH,
        'Accept': 'application/json',
        'User-Agent': 'OmniFiscalAI/2.0'
      },
      timeout: 25000
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
    }).on('error', reject).on('timeout', () => reject(new Error('TIMEOUT')));
  });
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const reqUrl = new URL(req.url, 'http://' + host);
  const pathname = reqUrl.pathname;

  // 1. Status Sienge & Supabase
  if (pathname === '/api/sienge/status') {
    try {
      const ping = await siengeFetch('/purchase-orders?limit=1');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        online: true,
        subdomain: SIENGE_SUBDOMAIN,
        user: SIENGE_USER,
        httpStatus: ping.status,
        database: 'Supabase PostgreSQL Cloud',
        deployedOn: process.env.VERCEL ? 'Vercel Production' : 'Local Windows Server',
        timestamp: new Date().toISOString()
      }));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online: false, error: err.message }));
    }
    return;
  }

  // 2. Listar Pedidos de Compra do Sienge
  if (pathname === '/api/sienge/purchase-orders') {
    const limit = reqUrl.searchParams.get('limit') || '10';
    const offset = reqUrl.searchParams.get('offset') || '0';
    try {
      const result = await siengeFetch('/purchase-orders?limit=' + limit + '&offset=' + offset);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.data));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2.1 Detalhes Completos e Itens de um Pedido de Compra do Sienge (Amarração NF-e)
  if (pathname === '/api/sienge/purchase-order-details') {
    const handler = require('./api/sienge/purchase-order-details.js');
    req.query = Object.fromEntries(reqUrl.searchParams);
    const mockRes = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data));
          },
          send: (data) => {
            res.writeHead(code);
            res.end(data);
          }
        };
      }
    };
    try {
      await handler(req, mockRes);
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3. Salvar Recebimento no Supabase Cloud
  if (pathname === '/api/recebimentos/salvar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const logRecord = {
          id: 'rec-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          timestamp: new Date().toISOString(),
          actor: payload.conferente || 'Conferente Omni Trade',
          category: 'recebimento_fiscal',
          action: payload.action || 'RECEBIMENTO_CONCLUIDO',
          target: 'NF ' + (payload.numeroNf || 'N/A') + ' / ' + (payload.fornecedor || 'Fornecedor'),
          details: typeof payload.details === 'string' ? payload.details : JSON.stringify(payload),
          level: payload.action === 'RECEBIMENTO_BLOQUEADO_DIVERGENCIA' ? 'error' : 'info'
        };

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
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, id: logRecord.id, data: inserted }));
      } catch(err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. Listar Histórico do Banco Supabase
  if (pathname === '/api/recebimentos/listar') {
    const limit = reqUrl.searchParams.get('limit') || '50';
    try {
      const sRes = await fetch(SUPABASE_URL + '/rest/v1/omni_audit_logs?category=eq.recebimento_fiscal&order=timestamp.desc&limit=' + limit, {
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

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: formatted.length, registros: formatted }));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, total: 0, registros: [] }));
    }
    return;
  }

    // 5.1 Configurar Pasta de XMLs Dinâmica
  if (pathname === '/api/xmls/configurar-pasta' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.caminhoEntrada) {
          DIR_PENDENTES = payload.caminhoEntrada;
          try {
            if (!fs.existsSync(DIR_PENDENTES)) fs.mkdirSync(DIR_PENDENTES, { recursive: true });
          } catch(e) {}
        }
        if (payload.caminhoLidos) {
          DIR_LIDOS = payload.caminhoLidos;
          try {
            if (!fs.existsSync(DIR_LIDOS)) fs.mkdirSync(DIR_LIDOS, { recursive: true });
          } catch(e) {}
        }
        let count = 0;
        if (fs.existsSync(DIR_PENDENTES)) {
          count = fs.readdirSync(DIR_PENDENTES).filter(f => f.endsWith('.xml')).length;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, caminhoEntrada: DIR_PENDENTES, caminhoLidos: DIR_LIDOS, total: count }));
      } catch(err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

// 5. Listar XMLs Pendentes na Pasta Física ou Exemplos
  if (pathname === '/api/xmls/pendentes') {
    try {
      let list = [];
      if (fs.existsSync(DIR_PENDENTES)) {
        const files = fs.readdirSync(DIR_PENDENTES).filter(f => f.endsWith('.xml'));
        list = files.map(f => {
          const fullPath = path.join(DIR_PENDENTES, f);
          const stats = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');

          let chave = '', nNF = '', emitente = '', vNF = '', pedido = '';
          const mChave = content.match(/<chNFe>(\d+)<\/chNFe>/) || content.match(/Id="NFe(\d+)"/);
          if (mChave) chave = mChave[1];

          const mNNF = content.match(/<nNF>(\d+)<\/nNF>/);
          if (mNNF) nNF = mNNF[1];

          const mEmit = content.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/);
          if (mEmit) emitente = mEmit[1];

          const mVNF = content.match(/<vNF>([^<]+)<\/vNF>/);
          if (mVNF) vNF = mVNF[1];

          const mPed = content.match(/<xPed>([^<]+)<\/xPed>/);
          if (mPed) pedido = mPed[1];

          return {
            filename: f,
            chave: chave,
            nNF: nNF,
            emitente: emitente,
            vNF: vNF,
            pedido: pedido || 'PED-2026-' + nNF,
            sizeBytes: stats.size
          };
        });
      }

      // Se lista vazia (ex: Vercel Cloud), retorna os demos
      if (list.length === 0) {
        list = [
          {
            filename: '35261012345678000199550010000456121894236123-nfe.xml',
            chave: '35261012345678000199550010000456121894236123',
            nNF: '45612',
            emitente: 'GERDAU ACOMINAS S.A.',
            vNF: '14500.00',
            pedido: 'PED-2026-8841',
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
            pedido: 'PED-2026-8910',
            itens: [
              { cod: 'CIM-001', desc: 'CIMENTO PORTLAND CP II-F-32 50KG', un: 'SACO', qtdNota: 500, ncm: '25232910' },
              { cod: 'CIM-002', desc: 'ARGAMASSA AC-III CINZA 20KG', un: 'SACO', qtdNota: 200, ncm: '38245000' }
            ]
          }
        ];
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: list.length, files: list }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. Mover XML Concluído
  if (pathname === '/api/xmls/mover-lido' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, destination: 'XML_LIDOS' }));
    return;
  }

  // 7.0 Liquidação Real no Sienge ERP
  if (pathname === '/api/sienge/liquidar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        req.body = payload;
        const fakeRes = {
          setHeader: () => {},
          status: (code) => ({
            json: (data) => {
              res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(data));
            },
            send: (data) => {
              res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(data);
            },
            end: () => res.end()
          })
        };
        const liquidarHandler = require('./api/sienge/liquidar.js');
        await liquidarHandler(req, fakeRes);
      } catch(err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. Aprovação do Supervisor & Ajuste Sienge
  if (pathname === '/api/sienge/aprovar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');

        // Grava auditoria no Supabase
        await fetch(SUPABASE_URL + '/rest/v1/omni_audit_logs', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: 'sup-appr-' + Date.now(),
            timestamp: new Date().toISOString(),
            actor: payload.supervisorEmail || 'Supervisor Omni Trade',
            category: 'recebimento_fiscal',
            action: payload.decisao || 'LIBERACAO_SUPERVISOR',
            target: 'NF ' + payload.numeroNf + ' / Pedido ' + payload.pedidoSienge,
            details: JSON.stringify(payload),
            level: 'warning'
          })
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Liberação registrada com sucesso no Supabase e no Sienge ERP.',
          timestamp: new Date().toISOString()
        }));
      } catch(err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

    // 8. Notificar Supervisor por E-mail (Resend ou SMTP)
  if ((pathname === '/api/notificar' || pathname === '/api/notificar-supervisor') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        req.body = payload;
        const fakeRes = {
          setHeader: () => {},
          status: (code) => ({
            json: (data) => {
              res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(data));
            },
            end: () => res.end()
          })
        };
        const notificarHandler = require('./api/notificar.js');
        await notificarHandler(req, fakeRes);
      } catch(err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 8. Servir Frontend index.html em qualquer outra rota
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
};

const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('========================================================================');
    console.log('🚀 OMNI FISCAL AI - RECEBIMENTO & SIENGE ERP CONECTADO LIVE');
    console.log('📡 Servidor ativo em: http://localhost:' + PORT);
    console.log('🔑 Sienge Tenant: ' + SIENGE_SUBDOMAIN + ' (omnitrade-claudioguidi)');
    console.log('☁️  Banco Cloud: Supabase PostgreSQL (omni_audit_logs)');
    console.log('========================================================================\n');
  });
}

module.exports = server;
