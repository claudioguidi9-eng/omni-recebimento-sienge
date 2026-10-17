const nodemailer = require('nodemailer');

function gerarHtmlEmail({ numeroNf, fornecedor, cnpj, obra, pedidoSienge, itens }) {
  let rows = (itens || []).map(i => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 12px; font-weight: 600;">${i.desc || 'Material'}</td>
      <td style="padding: 8px 12px; text-align: center;">${i.un || 'UN'}</td>
      <td style="padding: 8px 12px; text-align: center; color: #2563eb; font-weight: 700;">${i.qtdNfe || 0}</td>
      <td style="padding: 8px 12px; text-align: center; color: #dc2626; font-weight: 700;">${i.qtdFisica !== undefined ? i.qtdFisica : (i.qtdNfe - 10)}</td>
      <td style="padding: 8px 12px; text-align: right; color: #dc2626; font-weight: 700;">${i.diferenca || '-10'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; border-radius: 12px; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0b1329 0%, #1e293b 100%); color: #ffffff; padding: 20px 24px; border-bottom: 3px solid #dc2626; }
    .title { font-size: 18px; font-weight: 800; margin: 0; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .body { padding: 24px; }
    .alert-box { background-color: #fee2e2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 14px 18px; color: #991b1b; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; background-color: #f1f5f9; padding: 14px; border-radius: 8px; font-size: 13px; }
    .meta-item strong { color: #475569; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 2px; }
    .meta-item span { font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
    th { background-color: #f8fafc; text-align: left; padding: 8px 12px; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 20px; text-align: center; }
    .footer { background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">🚨 ALERTA FISCAL: NOTA RETIDA NO ALMOXARIFADO</div>
      <div class="subtitle">OmniFiscal AI | Sistema de Recebimento Cego & Sienge ERP Cloud</div>
    </div>
    <div class="body">
      <div class="alert-box">
        <strong>Atenção Supervisor:</strong> A nota fiscal abaixo teve sua conferência física <strong>bloqueada após 3 tentativas consecutivas com divergência</strong> entre a carga descarregada e o pedido de compra Sienge.
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <strong>Nota Fiscal:</strong>
          <span>NF-e ${numeroNf}</span>
        </div>
        <div class="meta-item">
          <strong>Pedido Sienge:</strong>
          <span>${pedidoSienge}</span>
        </div>
        <div class="meta-item">
          <strong>Fornecedor:</strong>
          <span>${fornecedor}</span>
        </div>
        <div class="meta-item">
          <strong>Obra / Destino:</strong>
          <span>${obra}</span>
        </div>
      </div>

      <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px;">Itens com Divergência Identificada:</div>
      <table>
        <thead>
          <tr>
            <th>Item / Descrição</th>
            <th style="text-align:center;">UN</th>
            <th style="text-align:center;">Qtd NF</th>
            <th style="text-align:center;">Físico</th>
            <th style="text-align:right;">Diferença</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="text-align: center;">
        <a href="https://omni-recebimento-sienge.vercel.app" class="btn">Acessar Portal para Avaliar Liberação</a>
      </div>
    </div>
    <div class="footer">
      Notificação formal gerada para o supervisor <strong>claudio.guidi@omnitradebrasil.com</strong>.<br>
      Omni Trade Brasil • Integração Sienge ERP
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = req.body || {};
  const destinatario = payload.supervisorEmail || 'claudio.guidi@omnitradebrasil.com';
  const numeroNf = payload.numeroNf || '000.048.912';
  const fornecedor = payload.fornecedor || 'VOTORANTIM CIMENTOS S.A.';
  const pedidoSienge = payload.pedidoSienge || 'PO #8921';
  const obra = payload.obra || 'Residencial Grand Reserva - Torre A';
  const itens = payload.itens || [];

  const html = gerarHtmlEmail({ numeroNf, fornecedor, obra, pedidoSienge, itens });
  const subject = `🚨 [ALERTA FISCAL] Recebimento Bloqueado: NF-e ${numeroNf} (${fornecedor})`;

  // 1. Gravar auditoria no Supabase
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwukvxzdzellvbcacxyj.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_UllsGGPZ_8e1eBN4kXyLTw_Sa8OiHML';

  try {
    await fetch(SUPABASE_URL + '/rest/v1/omni_audit_logs', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: 'mail-' + Date.now(),
        timestamp: new Date().toISOString(),
        actor: 'Sistema OmniFiscal AI',
        category: 'notificacao_supervisor',
        action: 'EMAIL_ALERTA_DISPARADO',
        target: 'Supervisor: ' + destinatario + ' (NF ' + numeroNf + ')',
        details: JSON.stringify({ destinatario, numeroNf, fornecedor, pedidoSienge }),
        level: 'warning'
      })
    });
  } catch(e) {}

  // 2. Envio Real via Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const rRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'OmniFiscal AI <onboarding@resend.dev>',
          to: [destinatario],
          subject: subject,
          html: html
        })
      });
      const data = await rRes.json();
      if (rRes.ok) {
        return res.status(200).json({ success: true, delivered: true, provider: 'resend', id: data.id });
      }
    } catch(err) {
      console.error('Erro Resend:', err);
    }
  }

  // 3. Envio Real via SMTP (Google Workspace / Nodemailer)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"OmniFiscal AI" <${process.env.SMTP_USER}>`,
        to: destinatario,
        subject: subject,
        html: html
      });

      return res.status(200).json({ success: true, delivered: true, provider: 'smtp', messageId: info.messageId });
    } catch(err) {
      console.error('Erro SMTP:', err);
      return res.status(200).json({ success: true, delivered: false, provider: 'smtp', error: err.message });
    }
  }

  // 4. Retorno informativo
  res.status(200).json({
    success: true,
    delivered: false,
    configNeeded: true,
    recipient: destinatario,
    subject: subject,
    message: 'Alerta formatado e registrado no Supabase. Para entrega real no seu e-mail corporativo, informe a chave RESEND_API_KEY ou credenciais SMTP (Google Workspace) nas configuracoes de ambiente.'
  });
};
