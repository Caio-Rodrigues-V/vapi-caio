import 'dotenv/config';
import { RetryPolicy } from '../application/campaigns/RetryPolicy';
import { RunCampaignDispatcher } from '../application/campaigns/RunCampaignDispatcher';
import {
  MySqlCampaignCallRepository,
  MySqlCampaignRepository,
} from '../infrastructure/mysql/MySqlCampaignRepository';
import { VapiPhoneProvider } from '../providers/dialer/VapiPhoneProvider';

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function main(): Promise<void> {
  const campaigns = new MySqlCampaignRepository();
  const calls = new MySqlCampaignCallRepository();
  const dialer = new VapiPhoneProvider(process.env.VAPI_API_KEY || '');
  const retryPolicy = new RetryPolicy({
    baseDelayMs: envInt('WORKER_RETRY_BASE_MS', 60_000),
    maxDelayMs: envInt('WORKER_RETRY_MAX_MS', 3_600_000),
    jitterRatio: Number(process.env.WORKER_RETRY_JITTER_RATIO || 0.2),
  });

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
  );

  const result = await dispatcher.execute();
  console.log(JSON.stringify({ worker: 'campaign-dispatcher', ...result }));
}

main().catch((error) => {
  console.error('[campaign-dispatcher] fatal:', error);
  process.exitCode = 1;
});
