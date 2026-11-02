CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`login_normalized` text,
	`ip_key` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`resolved_at` integer,
	CONSTRAINT "login_attempts_kind_check" CHECK("login_attempts"."kind" IN ('CREDENTIAL', 'CAPTCHA', 'HONEYPOT', 'MARKER')),
	CONSTRAINT "login_attempts_outcome_check" CHECK("login_attempts"."outcome" IN ('PENDING', 'FAILED', 'SUCCESS', 'CLEARED'))
);
--> statement-breakpoint
CREATE INDEX `login_attempts_login_occurred_idx` ON `login_attempts` (`login_normalized`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_occurred_idx` ON `login_attempts` (`ip_key`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_occurred_at_idx` ON `login_attempts` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `honeytokens` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`login_normalized` text,
	`alert_url_env` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_triggered_at` integer,
	`trigger_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "honeytokens_kind_check" CHECK("honeytokens"."kind" IN ('ACCOUNT_TRAP', 'AWS_KEYS'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `honeytokens_login_normalized_unique` ON `honeytokens` (`login_normalized`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`ip_key` text,
	`user_agent` text,
	`login_normalized` text,
	`user_id` text,
	`honeytoken_id` text,
	`details` text NOT NULL,
	`request_id` text NOT NULL,
	`acknowledged_at` integer,
	`acknowledged_by` text,
	`alert_status` text DEFAULT 'NONE' NOT NULL,
	`alert_attempted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`honeytoken_id`) REFERENCES `honeytokens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_events_severity_check" CHECK("security_events"."severity" IN ('INFO', 'WARNING', 'CRITICAL')),
	CONSTRAINT "security_events_alert_status_check" CHECK("security_events"."alert_status" IN ('NONE', 'PENDING', 'SENT', 'FAILED', 'SUPPRESSED'))
);
--> statement-breakpoint
CREATE INDEX `security_events_occurred_at_idx` ON `security_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `security_events_severity_acknowledged_idx` ON `security_events` (`severity`,`acknowledged_at`);--> statement-breakpoint
CREATE INDEX `security_events_type_idx` ON `security_events` (`type`);--> statement-breakpoint
CREATE TABLE `captcha_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`answer_mac` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`ip_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `captcha_challenges_expires_at_idx` ON `captcha_challenges` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_security_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`min_password_length` integer DEFAULT 12 NOT NULL,
	`reject_personal_data_in_password` integer DEFAULT false NOT NULL,
	`password_max_age_days` integer,
	`session_idle_timeout_minutes` integer DEFAULT 15 NOT NULL,
	`max_failed_login_attempts` integer DEFAULT 5 NOT NULL,
	`ip_failed_attempt_limit` integer DEFAULT 20 NOT NULL,
	`spraying_distinct_login_threshold` integer DEFAULT 8 NOT NULL,
	`security_event_retention_days` integer DEFAULT 90 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_settings_singleton_check" CHECK("__new_security_settings"."id" = 1),
	CONSTRAINT "security_settings_min_password_length_check" CHECK("__new_security_settings"."min_password_length" >= 12),
	CONSTRAINT "security_settings_max_failed_login_attempts_check" CHECK("__new_security_settings"."max_failed_login_attempts" BETWEEN 3 AND 20),
	CONSTRAINT "security_settings_ip_failed_attempt_limit_check" CHECK("__new_security_settings"."ip_failed_attempt_limit" BETWEEN 5 AND 500),
	CONSTRAINT "security_settings_spraying_distinct_login_threshold_check" CHECK("__new_security_settings"."spraying_distinct_login_threshold" BETWEEN 3 AND 50),
	CONSTRAINT "security_settings_security_event_retention_days_check" CHECK("__new_security_settings"."security_event_retention_days" BETWEEN 7 AND 365)
);
--> statement-breakpoint
INSERT INTO `__new_security_settings`("id", "min_password_length", "reject_personal_data_in_password", "password_max_age_days", "session_idle_timeout_minutes", "updated_at", "updated_by") SELECT "id", "min_password_length", "reject_personal_data_in_password", "password_max_age_days", "session_idle_timeout_minutes", "updated_at", "updated_by" FROM `security_settings`;--> statement-breakpoint
DROP TABLE `security_settings`;--> statement-breakpoint
ALTER TABLE `__new_security_settings` RENAME TO `security_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;