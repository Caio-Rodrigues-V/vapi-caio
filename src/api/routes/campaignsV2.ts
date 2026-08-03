import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from '../../db';
import { normalizePhone } from '../../utils/phoneValidator';

export const campaignsV2Router = Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
});

function requireAdmin(req: any, res: any, next: any) {
  const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
  const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token');
  if (!expected || provided !== expected) return res.status(401).json({ error: 'Não autorizado' });
  return next();
}

function normalizedRow(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), String(value ?? '').trim()]),
  );
}

campaignsV2Router.use(requireAdmin);

campaignsV2Router.get('/campaigns', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE c.status = ?' : '';
  const params = status ? [status, limit, offset] : [limit, offset];

  const [rows]: any = await pool.query(
    `SELECT c.*,
      SUM(cc.status IN ('pending','retry_scheduled')) AS pending_calls,
      SUM(cc.status IN ('reserved','queued','in_progress','answered')) AS active_calls,
      SUM(cc.status = 'completed') AS completed_calls,
      SUM(cc.status = 'failed') AS failed_calls,
      SUM(cc.status = 'skipped') AS skipped_calls,
      COUNT(cc.id) AS total_calls
     FROM campaigns c
     LEFT JOIN campaign_calls cc ON cc.campaign_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    params,
  );

  const countParams = status ? [status] : [];
  const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total FROM campaigns c ${where}`, countParams);
  return res.json({ page, limit, total: Number(countRows[0]?.total || 0), data: rows });
});

campaignsV2Router.post('/campaigns', async (req, res) => {
  const { name, assistantId, phoneNumberId, maxConcurrent = 1, maxAttempts = 5, scheduledAt = null } = req.body || {};
  if (!name || !assistantId) return res.status(400).json({ error: 'name e assistantId são obrigatórios' });

  const [result]: any = await pool.execute(
    `INSERT INTO campaigns
      (name,status,assistant_id,phone_number_id,max_concurrent,max_attempts,scheduled_at)
     VALUES (?, 'draft', ?, ?, ?, ?, ?)`,
    [String(name).trim(), String(assistantId).trim(), phoneNumberId ? String(phoneNumberId).trim() : null,
      Math.max(1, Number(maxConcurrent)), Math.max(1, Number(maxAttempts)), scheduledAt ? new Date(scheduledAt) : null],
  );
  const [rows]: any = await pool.execute('SELECT * FROM campaigns WHERE id = ?', [result.insertId]);
  return res.status(201).json(rows[0]);
});

campaignsV2Router.patch('/campaigns/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  const allowed = new Set(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']);
  if (!Number.isInteger(id) || id <= 0 || !allowed.has(status)) {
    return res.status(400).json({ error: 'Campanha ou status inválido' });
  }
  await pool.execute(
    `UPDATE campaigns
     SET status = ?,
         started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN ? IN ('completed','cancelled') THEN NOW() ELSE completed_at END
     WHERE id = ?`,
    [status, status, status, id],
  );
  return res.json({ ok: true, id, status });
});

campaignsV2Router.get('/campaigns/:id/calls', async (req, res) => {
  const id = Number(req.params.id);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const whereStatus = status ? 'AND cc.status = ?' : '';
  const params = status ? [id, status, limit, offset] : [id, limit, offset];

  const [rows]: any = await pool.query(
    `SELECT cc.*, cr.decision, cr.scheduled_callback_at, cr.created_at AS result_created_at
     FROM campaign_calls cc
     LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
     WHERE cc.campaign_id = ? ${whereStatus}
     ORDER BY cc.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return res.json({ page, limit, data: rows });
});

campaignsV2Router.post('/campaigns/:id/import', upload.single('file'), async (req, res) => {
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId) || campaignId <= 0 || !req.file) {
    return res.status(400).json({ error: 'Campanha e arquivo são obrigatórios' });
  }

  const [campaignRows]: any = await pool.execute('SELECT id FROM campaigns WHERE id = ? LIMIT 1', [campaignId]);
  if (!campaignRows.length) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }

  const rows: Record<string, string>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(req.file!.path)
        .pipe(parse({ columns: true, trim: true, skip_empty_lines: true, bom: true }))
        .on('data', (row) => rows.push(normalizedRow(row)))
        .on('error', reject)
        .on('end', resolve);
    });

    const connection = await pool.getConnection();
    let inserted = 0;
    let ignored = 0;
    try {
      await connection.beginTransaction();
      for (const row of rows) {
        const phoneRaw = row.telefone || row.phone || row.numero || row.celular || row.fone;
        const cpf = String(row.cpf || '').replace(/\D/g, '').padStart(11, '0');
        const customerNumber = phoneRaw ? normalizePhone(String(phoneRaw)) : null;
        if (!customerNumber || cpf.length !== 11) {
          ignored += 1;
          continue;
        }
        await connection.execute(
          `INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
           VALUES (?, ?, ?, 'pending', ?)`,
          [campaignId, customerNumber, cpf, JSON.stringify({ source: 'file_import', name: row.nome || row.name || null })],
        );
        inserted += 1;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({ campaignId, totalRows: rows.length, inserted, ignored });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});
