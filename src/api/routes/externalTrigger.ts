import { Router, Request, Response } from 'express';
import pool from '../../db';
import { normalizePhone } from '../../utils/phoneValidator';

export const externalTriggerRouter = Router();

function requireAuthToken(req: Request, res: Response, next: any) {
  const expectedToken = process.env.API_AUTH_TOKEN || process.env.WORKER_TRIGGER_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
  const providedToken =
    req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.header('x-api-token') ||
    (req.query.token as string) ||
    (req.query.api_token as string) ||
    req.body?.token;
  
  if (expectedToken && providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Não autorizado. Token de API ausente ou inválido.' });
  }
  return next();
}

externalTriggerRouter.use(requireAuthToken);

externalTriggerRouter.get('/calls/trigger', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    status: 'online',
    endpoint: '/api/v2/calls/trigger',
    methodRequired: 'POST',
    message: 'Endpoint de disparo ativo. Envie uma requisição HTTP POST com o JSON do contato para efetuar a chamada.',
  });
});

externalTriggerRouter.post('/calls/trigger', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const rawNumber = body.customerNumber || body.customer_number || body.telefone || body.phone;
    const rawCpf = body.cpf || body.customerCpf || body.customer_cpf || body.documento;
    const name = body.customerName || body.customer_name || body.nome || 'Cliente';
    const assistantId = body.assistantId || body.assistant_id || process.env.VAPI_ASSISTANT_ID_UVA;
    const phoneNumberId = body.phoneNumberId || body.phone_number_id || process.env.VAPI_PHONE_NUMBER_ID;
    const callbackUrl = body.callbackUrl || body.callback_url || null;
    
    // External IDs mapping
    const contactId = body.contactId || body.contact_id || null;
    const campaignContactId = body.campaignContactId || body.campaign_contact_id || null;
    const externalCampaignId = body.campaignId || body.campaign_id || null;

    if (!rawNumber) {
      return res.status(400).json({ error: 'customerNumber / telefone é obrigatório.' });
    }

    const phoneE164 = normalizePhone(String(rawNumber));
    if (!phoneE164) {
      return res.status(400).json({ error: 'Número de telefone inválido para o formato E.164.' });
    }

    const cpfDigits = String(rawCpf || '').replace(/\D/g, '');
    const cpf = cpfDigits.length === 11 ? cpfDigits : null;

    // 1. Find or create an active API campaign for these calls
    const campaignName = externalCampaignId
      ? `Campanha Externa #${externalCampaignId}`
      : 'Campanha API Externa';

    const [campaignRows]: any = await pool.query(
      `SELECT id FROM campaigns
       WHERE status IN ('running', 'draft', 'scheduled')
       AND assistant_id = ?
       ORDER BY id DESC LIMIT 1`,
      [assistantId || '']
    );

    let campaignId: number;

    if (campaignRows.length > 0) {
      campaignId = campaignRows[0].id;
    } else {
      const [insertCampaign]: any = await pool.execute(
        `INSERT INTO campaigns (name, status, assistant_id, phone_number_id, max_concurrent, max_attempts)
         VALUES (?, 'running', ?, ?, 1, 5)`,
        [campaignName, assistantId || '', phoneNumberId || '']
      );
      campaignId = insertCampaign.insertId;
    }

    // 2. Build metadata object storing all partner external references
    const metadata = {
      name,
      contactId,
      campaignContactId,
      externalCampaignId,
      callbackUrl,
      tipoTelefonia: body.tipoTelefonia || 'vapi',
      institution: 'UVA',
      rawPayload: body,
    };

    // 3. Insert call into campaign_calls queue
    const [result]: any = await pool.execute(
      `INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
       VALUES (?, ?, ?, 'pending', ?)`,
      [campaignId, phoneE164, cpf, JSON.stringify(metadata)]
    );

    return res.status(201).json({
      ok: true,
      message: 'Chamada adicionada à fila de disparo com sucesso.',
      data: {
        callId: result.insertId,
        campaignId,
        customerNumber: phoneE164,
        cpf,
        status: 'pending',
        contactId,
        campaignContactId,
        callbackUrl,
      },
    });
  } catch (error: any) {
    console.error('[externalTrigger] error:', error);
    return res.status(500).json({ error: 'Erro ao processar disparo externo', details: error.message });
  }
});
