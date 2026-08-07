"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySqlCampaignCallRepository = exports.MySqlCampaignRepository = void 0;
const db_1 = __importDefault(require("../../db"));
function parseMetadata(value) {
    if (!value)
        return {};
    if (typeof value === 'object')
        return value;
    try {
        return JSON.parse(String(value));
    }
    catch {
        return {};
    }
}
function mapCampaign(row) {
    return {
        id: Number(row.id), name: row.name, status: row.status, assistantId: row.assistant_id,
        phoneNumberId: row.phone_number_id, maxConcurrent: Number(row.max_concurrent),
        maxAttempts: Number(row.max_attempts), scheduledAt: row.scheduled_at,
        createdAt: row.created_at, updatedAt: row.updated_at,
    };
}
function mapCall(row) {
    return {
        id: Number(row.id), campaignId: Number(row.campaign_id), customerNumber: row.customer_number,
        cpf: row.cpf, status: row.status, providerCallId: row.provider_call_id,
        attempts: Number(row.attempts), nextAttemptAt: row.next_attempt_at, lockedAt: row.locked_at,
        lastError: row.last_error, metadata: parseMetadata(row.metadata),
        createdAt: row.created_at, updatedAt: row.updated_at,
    };
}
class MySqlCampaignRepository {
    async create(input) {
        const [result] = await db_1.default.execute(`INSERT INTO campaigns (name,status,assistant_id,phone_number_id,max_concurrent,max_attempts,scheduled_at)
       VALUES (?,?,?,?,?,?,?)`, [input.name, input.status, input.assistantId, input.phoneNumberId ?? null, input.maxConcurrent, input.maxAttempts, input.scheduledAt ?? null]);
        const campaign = await this.findById(result.insertId);
        if (!campaign)
            throw new Error('Campanha criada, mas não encontrada.');
        return campaign;
    }
    async findById(id) {
        const [rows] = await db_1.default.execute('SELECT * FROM campaigns WHERE id = ? LIMIT 1', [id]);
        return rows[0] ? mapCampaign(rows[0]) : null;
    }
    async findRunnable(limit) {
        const [rows] = await db_1.default.execute(`SELECT * FROM campaigns
       WHERE status = 'running' AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       ORDER BY COALESCE(scheduled_at, created_at), id LIMIT ?`, [Math.max(1, limit)]);
        return rows.map(mapCampaign);
    }
    async updateStatus(id, status) {
        await db_1.default.execute('UPDATE campaigns SET status = ? WHERE id = ?', [status, id]);
    }
}
exports.MySqlCampaignRepository = MySqlCampaignRepository;
class MySqlCampaignCallRepository {
    async add(input) {
        const [result] = await db_1.default.execute(`INSERT INTO campaign_calls (campaign_id,customer_number,cpf,metadata) VALUES (?,?,?,?)`, [input.campaignId, input.customerNumber, input.cpf ?? null, JSON.stringify(input.metadata ?? {})]);
        const [rows] = await db_1.default.execute('SELECT * FROM campaign_calls WHERE id = ?', [result.insertId]);
        const row = rows[0];
        if (!row)
            throw new Error('Chamada criada, mas não encontrada.');
        return mapCall(row);
    }
    async reserveBatch(campaignId, limit, lockId) {
        const connection = await db_1.default.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query(`SELECT * FROM campaign_calls
         WHERE campaign_id = ? AND status IN ('pending','retry_scheduled')
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
         ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`, [campaignId, Math.max(1, limit)]);
            if (!rows.length) {
                await connection.commit();
                return [];
            }
            const ids = rows.map((row) => Number(row.id));
            await connection.query(`UPDATE campaign_calls SET status='reserved', locked_at=NOW(), metadata=JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lockId', ?)
         WHERE id IN (${ids.map(() => '?').join(',')})`, [lockId, ...ids]);
            await connection.commit();
            return rows.map((row) => ({ ...mapCall(row), status: 'reserved', lockedAt: new Date(), metadata: { ...parseMetadata(row.metadata), lockId } }));
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async countActive(campaignId) {
        const params = [];
        let sql = `SELECT COUNT(*) AS total FROM campaign_calls WHERE status IN ('reserved','queued','in_progress','answered')`;
        if (campaignId !== undefined) {
            sql += ' AND campaign_id = ?';
            params.push(campaignId);
        }
        const [rows] = await db_1.default.execute(sql, params);
        return Number(rows[0]?.total ?? 0);
    }
    async attachProviderCall(id, providerCallId) {
        await db_1.default.execute(`UPDATE campaign_calls SET provider_call_id=?, status='queued', attempts=attempts+1 WHERE id=?`, [providerCallId, id]);
    }
    async mergeMetadata(id, metadata) {
        const entries = Object.entries(metadata);
        if (!entries.length)
            return;
        const args = [];
        const expressions = entries.map(([key, value]) => {
            args.push(`$.${key}`, JSON.stringify(value));
            return "?, JSON_EXTRACT(?, '$')";
        });
        args.push(id);
        await db_1.default.execute(`UPDATE campaign_calls
       SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), ${expressions.join(', ')})
       WHERE id = ?`, args);
    }
    async updateStatus(id, status, error = null) {
        await db_1.default.execute('UPDATE campaign_calls SET status=?, last_error=?, locked_at=NULL WHERE id=?', [status, error, id]);
    }
    async scheduleRetry(id, nextAttemptAt, error) {
        await db_1.default.execute(`UPDATE campaign_calls SET status='retry_scheduled', attempts=attempts+1, next_attempt_at=?, last_error=?, locked_at=NULL WHERE id=?`, [nextAttemptAt, error, id]);
    }
    async releaseStaleLocks(olderThan) {
        const [result] = await db_1.default.execute(`UPDATE campaign_calls SET status='retry_scheduled', locked_at=NULL, next_attempt_at=NOW(), last_error='stale_lock_recovered'
       WHERE status='reserved' AND locked_at < ?`, [olderThan]);
        return result.affectedRows;
    }
    async recoverTimedOutCalls(olderThan, maxAttempts) {
        const [result] = await db_1.default.execute(`UPDATE campaign_calls
       SET status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'retry_scheduled' END,
           attempts = attempts + 1,
           next_attempt_at = CASE WHEN attempts + 1 >= ? THEN NULL ELSE NOW() END,
           locked_at = NULL,
           last_error = 'watchdog_timeout'
       WHERE status IN ('queued','in_progress','answered') AND updated_at < ?`, [maxAttempts, maxAttempts, olderThan]);
        return result.affectedRows;
    }
}
exports.MySqlCampaignCallRepository = MySqlCampaignCallRepository;
//# sourceMappingURL=MySqlCampaignRepository.js.map