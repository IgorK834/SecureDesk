PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`auth_stage` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_auth_stage_check" CHECK("__new_sessions"."auth_stage" IN ('INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED', 'TOTP_CHALLENGE', 'FULLY_AUTHENTICATED'))
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "token_hash", "created_at", "last_activity_at", "expires_at", "revoked_at", "auth_stage") SELECT "id", "user_id", "token_hash", "created_at", "last_activity_at", "expires_at", "revoked_at", "auth_stage" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_last_activity_at_idx` ON `sessions` (`last_activity_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret_encrypted` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_used_step` integer;