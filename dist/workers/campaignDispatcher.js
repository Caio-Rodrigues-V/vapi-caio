"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCampaignDispatcher = runCampaignDispatcher;
require("dotenv/config");
const db_1 = __importDefault(require("../db"));
const AssistantResolver_1 = require("../application/campaigns/AssistantResolver");
const RetryPolicy_1 = require("../application/campaigns/RetryPolicy");
const RunCampaignDispatcher_1 = require("../application/campaigns/RunCampaignDispatcher");
const MySqlCampaignRepository_1 = require("../infrastructure/mysql/MySqlCampaignRepository");
const DdmDebtProvider_1 = require("../providers/debt/DdmDebtProvider");
const VapiPhoneProvider_1 = require("../providers/dialer/VapiPhoneProvider");
function envInt(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} não configurado.`);
    return value;
}
async function runCampaignDispatcher() {
    const campaigns = new MySqlCampaignRepository_1.MySqlCampaignRepository();
    const calls = new MySqlCampaignRepository_1.MySqlCampaignCallRepository();
    const dialer = new VapiPhoneProvider_1.VapiPhoneProvider(requiredEnv('VAPI_API_KEY'));
    const debts = new DdmDebtProvider_1.DdmDebtProvider({
        token: process.env.DDM_TOKEN_BUSCA || process.env.DDM_API_TOKEN || '',
        tokenCalcula: process.env.DDM_TOKEN || '',
        baseUrl: process.env.DDM_BASE_URL || 'https://ddmacordos.com',
        timeoutMs: envInt('DDM_TIMEOUT_MS', 7_000),
        maxRetries: envInt('DDM_MAX_RETRIES', 3),
    });
    const assistantResolver = new AssistantResolver_1.AssistantResolver({
        uvaAssistantId: requiredEnv('VAPI_ASSISTANT_ID_UVA'),
    });
    const retryPolicy = new RetryPolicy_1.RetryPolicy({
        baseDelayMs: envInt('WORKER_RETRY_BASE_MS', 60_000),
        maxDelayMs: envInt('WORKER_RETRY_MAX_MS', 3_600_000),
        jitterRatio: Number(process.env.WORKER_RETRY_JITTER_RATIO || 0.2),
    });
    requiredEnv('VAPI_PHONE_NUMBER_ID');
    const dispatcher = new RunCampaignDispatcher_1.RunCampaignDispatcher(campaigns, calls, dialer, retryPolicy, {
        globalMaxConcurrent: envInt('GLOBAL_MAX_CONCURRENT', 100),
        campaignScanLimit: envInt('WORKER_CAMPAIGN_SCAN_LIMIT', 20),
        staleLockMinutes: envInt('WORKER_STALE_LOCK_MINUTES', 15),
        watchdogTimeoutMinutes: envInt('WORKER_WATCHDOG_TIMEOUT_MINUTES', 8),
        defaultMaxAttempts: envInt('WORKER_MAX_TRIES', 5),
    }, debts, assistantResolver);
    const result = await dispatcher.execute();
    return { worker: 'campaign-dispatcher', operation: 'uva', ...result };
}
async function runStandalone() {
    try {
        const result = await runCampaignDispatcher();
        console.log(JSON.stringify(result));
    }
    catch (error) {
        console.error('[campaign-dispatcher] fatal:', error);
        process.exitCode = 1;
    }
    finally {
        try {
            await db_1.default.end();
        }
        catch (error) {
            console.error('[campaign-dispatcher] erro ao encerrar pool:', error);
            process.exitCode = 1;
        }
    }
}
if (require.main === module) {
    void runStandalone();
}
//# sourceMappingURL=campaignDispatcher.js.map