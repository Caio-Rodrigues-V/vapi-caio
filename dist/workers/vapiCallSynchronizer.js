"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVapiCallSynchronizer = runVapiCallSynchronizer;
const axios_1 = __importDefault(require("axios"));
const db_1 = __importDefault(require("../db"));
function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} não configurada.`);
    return value;
}
function mapStatus(call) {
    const status = String(call.status || '').toLowerCase();
    const endedReason = String(call.endedReason || '').toLowerCase();
    if (status === 'queued' || status === 'ringing')
        return status === 'queued' ? 'queued' : 'in_progress';
    if (status === 'in-progress')
        return 'in_progress';
    if (status === 'answered')
        return 'answered';
    if (status === 'failed')
        return 'failed';
    if (status === 'ended' || status === 'completed') {
        return /(error|failed|providerfault|timeout|busy|unreachable|invalid|rejected)/i.test(endedReason)
            ? 'failed'
            : 'completed';
    }
    return null;
}
function durationSeconds(call) {
    const startedAt = call.startedAt ? new Date(call.startedAt).getTime() : NaN;
    const endedAt = call.endedAt ? new Date(call.endedAt).getTime() : NaN;
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt))
        return null;
    return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}
async function runVapiCallSynchronizer(limit = 100) {
    const apiKey = requiredEnv('VAPI_API_KEY');
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const client = axios_1.default.create({
        baseURL: 'https://api.vapi.ai',
        timeout: 20_000,
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const [rows] = await db_1.default.execute(`SELECT id, provider_call_id, status
     FROM campaign_calls
     WHERE provider_call_id IS NOT NULL
       AND status IN ('queued','in_progress','answered')
     ORDER BY updated_at ASC
     LIMIT ?`, [safeLimit]);
    const result = {
        scanned: rows.length,
        updated: 0,
        completed: 0,
        failed: 0,
        unchanged: 0,
        errors: [],
    };
    for (const row of rows) {
        const campaignCallId = Number(row.id);
        const providerCallId = String(row.provider_call_id);
        try {
            const response = await client.get(`/call/${providerCallId}`);
            const call = response.data || {};
            const mappedStatus = mapStatus(call);
            if (!mappedStatus) {
                result.unchanged += 1;
                continue;
            }
            const transcript = String(call.transcript || call.artifact?.transcript || '') || null;
            const recordingUrl = String(call.recordingUrl || call.artifact?.recordingUrl || call.artifact?.recording?.url || '') || null;
            const endedReason = String(call.endedReason || '') || null;
            const duration = durationSeconds(call);
            await db_1.default.execute(`UPDATE campaign_calls
         SET status = ?,
             duration_seconds = COALESCE(?, duration_seconds),
             recording_url = COALESCE(?, recording_url),
             transcript = COALESCE(?, transcript),
             last_error = CASE WHEN ? = 'failed' THEN ? ELSE last_error END,
             locked_at = CASE WHEN ? IN ('completed','failed') THEN NULL ELSE locked_at END,
             metadata = JSON_SET(
               COALESCE(metadata, JSON_OBJECT()),
               '$.vapiStatusSyncedAt', ?,
               '$.endedReason', JSON_EXTRACT(?, '$')
             )
         WHERE id = ?`, [
                mappedStatus,
                duration,
                recordingUrl,
                transcript,
                mappedStatus,
                endedReason,
                mappedStatus,
                new Date().toISOString(),
                JSON.stringify(endedReason),
                campaignCallId,
            ]);
            result.updated += 1;
            if (mappedStatus === 'completed')
                result.completed += 1;
            if (mappedStatus === 'failed')
                result.failed += 1;
        }
        catch (error) {
            const message = axios_1.default.isAxiosError(error)
                ? String(error.response?.data?.message || error.response?.data?.error || error.message)
                : error instanceof Error ? error.message : String(error);
            result.errors.push({ campaignCallId, providerCallId, error: message });
        }
    }
    return result;
}
//# sourceMappingURL=vapiCallSynchronizer.js.map