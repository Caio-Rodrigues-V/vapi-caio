CREATE TABLE IF NOT EXISTS call_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_call_id BIGINT UNSIGNED NOT NULL,
  provider_call_id VARCHAR(128) NOT NULL,
  decision ENUM('formalize','schedule','zero') NOT NULL DEFAULT 'zero',
  scheduled_callback_at DATETIME NULL,
  duration_seconds INT UNSIGNED NULL,
  recording_url VARCHAR(768) NULL,
  transcript LONGTEXT NULL,
  ended_reason VARCHAR(160) NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_call_results_provider_call (provider_call_id),
  KEY idx_call_results_campaign_call (campaign_call_id),
  KEY idx_call_results_decision (decision, scheduled_callback_at),
  CONSTRAINT fk_call_results_campaign_call
    FOREIGN KEY (campaign_call_id) REFERENCES campaign_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS event_id VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS processing_error TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_event_id
  ON webhook_events (provider, event_id);

INSERT IGNORE INTO schema_migrations (version) VALUES ('002_call_results');
