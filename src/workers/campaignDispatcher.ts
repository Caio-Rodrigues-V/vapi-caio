import 'dotenv/config';
import pool from '../db';
import { AssistantResolver } from '../application/campaigns/AssistantResolver';
import { RetryPolicy } from '../application/campaigns/RetryPolicy';
import { RunCampaignDispatcher } from '../application/campaigns/RunCampaignDispatcher';
import {
  MySqlCampaignCallRepository,
  MySqlCampaignRepository,
} from '../infrastructure/mysql/MySqlCampaignRepository';
import { DdmDebtProvider } from '../providers/debt/DdmDebtProvider';
import { VapiPhoneProvider } from '../providers/dialer/VapiPhoneProvider';

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado.`);
  return value;
}

async function main(): Promise<void> {
  const campaigns = new MySqlCampaignRepository();
  const calls = new MySqlCampaignCallRepository();
  const dialer = new VapiPhoneProvider(requiredEnv('VAPI_API_KEY'));
  const debts = new DdmDebtProvider({
    token: process.env.DDM_TOKEN_BUSCA || process.env.DDM_API_TOKEN || '',
    baseUrl: process.env.DDM_BASE_URL || 'https://ddmacordos.com',
    timeoutMs: envInt('DDM_TIMEOUT_MS', 7_000),
    maxRetries: envInt('DDM_MAX_RETRIES', 3),
  });
  const assistantResolver = new AssistantResolver({
    uvaAssistantId: requiredEnv('VAPI_ASSISTANT_ID_UVA'),
  });
  const retryPolicy = new RetryPolicy({
    baseDelayMs: envInt('WORKER_RETRY_BASE_MS', 60_000),
    maxDelayMs: envInt('WORKER_RETRY_MAX_MS', 3_600_000),
    jitterRatio: Number(process.env.WORKER_RETRY_JITTER_RATIO || 0.2),
  });

  requiredEnv('VAPI_PHONE_NUMBER_ID');

  const dispatcher = new RunCampaignDispatcher(
    campaigns,
    calls,
    dialer,
    retryPolicy,
    {
      globalMaxConcurrent: envInt('GLOBAL_MAX_CONCURRENT', 10),
      campaignScanLimit: envInt('WORKER_CAMPAIGN_SCAN_LIMIT', 20),
      staleLockMinutes: envInt('WORKER_STALE_LOCK_MINUTES', 15),
      watchdogTimeoutMinutes: envInt('WORKER_WATCHDOG_TIMEOUT_MINUTES', 8),
      defaultMaxAttempts: envInt('WORKER_MAX_TRIES', 5),
    },
    debts,
    assistantResolver,
  );

  const result = await dispatcher.execute();
  console.log(JSON.stringify({ worker: 'campaign-dispatcher', operation: 'uva', ...result }));
}

void main()
  .catch((error) => {
    console.error('[campaign-dispatcher] fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error('[campaign-dispatcher] erro ao encerrar pool:', error);
      process.exitCode = 1;
    }
  });
