"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationSender = void 0;
const axios_1 = __importDefault(require("axios"));
const nodemailer_1 = __importDefault(require("nodemailer"));
class NotificationSender {
    getSmtpConfig() {
        const host = process.env.SMTP_HOST || 'mail.ddm.adv.br';
        const port = Number(process.env.SMTP_PORT || 587);
        const user = process.env.SMTP_USER || '';
        const pass = process.env.SMTP_PASSWORD || '';
        const secure = process.env.SMTP_SECURE === 'true';
        return { host, port, user, pass, secure };
    }
    buildHtmlEmail(input) {
        const linkPix = input.linkPix || '';
        const linkBoleto = input.linkBoleto || '';
        const linhaDig = input.linhaDigitavel || '';
        const vencimento = input.vencimento || '';
        const secaoPix = linkPix
            ? `<tr>
          <td style="padding:8px 0;">
            <b style="color:#101828;">Pix:</b><br>
            <a href="${linkPix}" style="color:#FF5706;">${linkPix}</a>
          </td>
         </tr>`
            : '';
        const boletoHtml = linkBoleto
            ? `<a href="${linkBoleto}" style="color:#FF5706;">${linkBoleto}</a>`
            : '<span style="color:#667085;">Link de boleto indisponível.</span>';
        const secaoBoleto = (linkBoleto || linhaDig)
            ? `<tr>
          <td style="padding:8px 0;">
            <b style="color:#101828;">Boleto:</b><br>
            ${boletoHtml}
            ${linhaDig ? `<br><span style="color:#667085;font-size:13px;">Linha digitável: ${linhaDig}</span>` : ''}
            ${vencimento ? `<br><span style="color:#667085;font-size:13px;">Vencimento: ${vencimento}</span>` : ''}
          </td>
         </tr>`
            : '';
        const secaoLinks = (linkPix || linkBoleto || linhaDig)
            ? `<p style="color:#101828;font-weight:bold;margin:0 0 12px;">Links para pagamento:</p>
         <table width="100%" cellpadding="0" cellspacing="0">
           ${secaoPix}
           ${secaoBoleto}
         </table>`
            : '';
        return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:#FF5706;padding:28px 36px;">
  <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,h=152,fit=crop/m6L4ppGnqncBWn2J/ativo-16-YZ9a5WVxR2fx79Vd.png"
       alt="DDM" height="40" style="display:block;" />
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 36px;">
  <p style="color:#101828;font-size:18px;font-weight:bold;margin:0 0 8px;">Acordo formalizado com sucesso!</p>
  <p style="color:#475467;font-size:15px;margin:0 0 24px;">Prezado(a) ${input.nome},</p>
  <p style="color:#475467;font-size:14px;line-height:1.6;margin:0 0 24px;">
    Confirmamos a formalização do acordo referente à pendência financeira vinculada à
    <strong>${input.instituicao}</strong>, conforme tratado em nossa ligação.
  </p>

  <!-- Detalhes -->
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:24px;">
    <tr><td style="padding:6px 0;">
      <span style="color:#667085;font-size:13px;">Instituição</span><br>
      <strong style="color:#101828;">${input.instituicao}</strong>
    </td></tr>
    <tr><td style="padding:6px 0;">
      <span style="color:#667085;font-size:13px;">Forma de pagamento</span><br>
      <strong style="color:#101828;">${input.formaPagamento}</strong>
    </td></tr>
    <tr><td style="padding:6px 0;">
      <span style="color:#667085;font-size:13px;">Valor acordado</span><br>
      <strong style="color:#101828;font-size:18px;">R$ ${input.valor}</strong>
    </td></tr>
  </table>

  <!-- Links de pagamento -->
  ${secaoLinks}

  <p style="color:#475467;font-size:13px;margin:24px 0 0;line-height:1.6;">
    Qualquer dúvida, nossa equipe está à disposição.<br>
    <strong>Equipe de Atendimento – DDM</strong>
  </p>
</td></tr>

<tr><td style="background:#f9fafb;padding:20px 36px;text-align:center;">
  <p style="color:#98a2b3;font-size:12px;margin:0;">
    © DDM Assessoria | Este é um e-mail automático, não responda diretamente.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
    }
    async send(input) {
        let n8nSent = false;
        let emailSent = false;
        const n8nUrl = process.env.N8N_WEBHOOK_URL;
        const debugEmail = process.env.DEBUG_EMAIL_RECIPIENT;
        const targetEmail = debugEmail || input.email;
        const targetPhone = process.env.DEBUG_PHONE_RECIPIENT || input.phone;
        // 1. Enviar para n8n se configurado
        if (n8nUrl) {
            try {
                console.log(`[NotificationSender] Enviando acordo para o n8n: ${n8nUrl}`);
                const response = await axios_1.default.post(n8nUrl, {
                    cpf: input.cpf,
                    nome: input.nome,
                    email: targetEmail,
                    phone: targetPhone,
                    original_email: input.email,
                    original_phone: input.phone,
                    instituicao: input.instituicao,
                    valor: input.valor,
                    forma_pagamento: input.formaPagamento,
                    link_boleto: input.linkBoleto,
                    link_pix: input.linkPix,
                    linha_dig: input.linhaDigitavel,
                    vencimento: input.vencimento,
                    nr_acordo: input.numeroAcordo,
                    vapi_call_id: input.vapiCallId,
                    pagamento_pronto: input.pagamentoPronto,
                }, { timeout: 10000 });
                if (response.status >= 200 && response.status < 300) {
                    n8nSent = true;
                    emailSent = true; // Considera enviado se n8n aceitou e cuida do fluxo
                    console.log(`[NotificationSender] Envio n8n concluído com sucesso (HTTP ${response.status})`);
                }
                else {
                    console.warn(`[NotificationSender] n8n retornou código de status: ${response.status}`);
                }
            }
            catch (error) {
                console.error(`[NotificationSender] Erro ao enviar webhook para n8n: ${error.message}`);
            }
        }
        // 2. Se n8n não foi acionado ou falhou, usa SMTP Direto
        if (!n8nSent && targetEmail) {
            const config = this.getSmtpConfig();
            if (!config.user || !config.pass) {
                console.warn('[NotificationSender] SMTP não configurado (pass ou user ausentes). E-mail ignorado.');
            }
            else {
                try {
                    const transporter = nodemailer_1.default.createTransport({
                        host: config.host,
                        port: config.port,
                        secure: config.secure,
                        auth: {
                            user: config.user,
                            pass: config.pass,
                        },
                        tls: {
                            rejectUnauthorized: false, // Evita erros comuns de certificado em servidores cPanel
                        },
                    });
                    const from = process.env.SMTP_FROM || `"DDM Assessoria" <${config.user}>`;
                    const html = this.buildHtmlEmail({ ...input, email: targetEmail });
                    console.log(`[NotificationSender] Enviando e-mail SMTP direto para ${targetEmail}`);
                    await transporter.sendMail({
                        from,
                        to: targetEmail,
                        subject: `Acordo Formalizado — ${input.instituicao}`,
                        html,
                    });
                    emailSent = true;
                    console.log(`[NotificationSender] E-mail SMTP enviado com sucesso para ${targetEmail}`);
                }
                catch (error) {
                    console.error(`[NotificationSender] Erro ao enviar e-mail via SMTP: ${error.message}`);
                }
            }
        }
        // 3. Disparo de SMS / RCS via Smart RCS
        let smsSent = false;
        if (targetPhone) {
            smsSent = await this.sendSmartRcsSms(input, targetPhone);
        }
        return { emailSent, n8nSent, smsSent };
    }
    async sendSmartRcsSms(input, targetPhone) {
        const apiKey = process.env.SMART_RCS_API_KEY;
        const apiUrl = process.env.SMART_RCS_API_URL || 'https://api.smartrcs.com.br/v1/messages';
        if (!apiKey) {
            console.log('[NotificationSender] SMART_RCS_API_KEY não configurada no env. Envio de SMS/RCS ignorado.');
            return false;
        }
        try {
            const formattedPhone = targetPhone.replace(/\D/g, '');
            const cleanPhone = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
            const link = input.linkBoleto || input.linkPix || '';
            const linhaDigText = input.linhaDigitavel ? ` Linha Digitavel: ${input.linhaDigitavel}` : '';
            const linkText = link ? ` Boleto/Pix: ${link}` : '';
            const messageText = `DDM: Ola ${input.nome}, seu acordo com ${input.instituicao} (R$ ${input.valor}) foi formalizado!${linhaDigText}${linkText}`;
            console.log(`[NotificationSender] Enviando SMS/RCS via Smart RCS para ${cleanPhone}...`);
            const response = await axios_1.default.post(apiUrl, {
                destination: cleanPhone,
                phone: cleanPhone,
                message: messageText,
                text: messageText,
                link: link || undefined,
                cpf: input.cpf,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            if (response.status >= 200 && response.status < 300) {
                console.log(`[NotificationSender] SMS Smart RCS enviado com sucesso para ${cleanPhone}`);
                return true;
            }
        }
        catch (error) {
            console.error(`[NotificationSender] Falha ao enviar SMS Smart RCS para ${targetPhone}:`, error.response?.data || error.message);
        }
        return false;
    }
}
exports.NotificationSender = NotificationSender;
//# sourceMappingURL=NotificationSender.js.map