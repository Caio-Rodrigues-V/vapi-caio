CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  status ENUM('draft','scheduled','running','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
  assistant_id VARCHAR(128) NOT NULL,
  phone_number_id VARCHAR(128) NULL,
  max_concurrent INT UNSIGNED NOT NULL DEFAULT 1,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
  scheduled_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaigns_status_schedule (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_calls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  customer_number VARCHAR(20) NOT NULL,
  cpf VARCHAR(14) NULL,
  status ENUM('pending','reserved','queued','in_progress','answered','completed','retry_scheduled','skipped','failed') NOT NULL DEFAULT 'pending',
  provider_call_id VARCHAR(128) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  locked_at DATETIME NULL,
  last_error TEXT NULL,
  metadata JSON NULL,
  duration_seconds INT UNSIGNED NULL,
  recording_url VARCHAR(768) NULL,
  transcript LONGTEXT NULL,
  result_code VARCHAR(64) NULL,
  scheduled_callback_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_campaign_calls_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE KEY uq_campaign_calls_provider_call (provider_call_id),
  KEY idx_campaign_calls_worker (campaign_id, status, next_attempt_at, locked_at),
  KEY idx_campaign_calls_customer (customer_number),
  KEY idx_campaign_calls_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(32) NOT NULL DEFAULT 'vapi',
  provider_call_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  payload JSON NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_events_idempotency (provider, provider_call_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001_call_platform_core');
