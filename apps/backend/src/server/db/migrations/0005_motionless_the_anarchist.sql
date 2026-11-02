PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`login_normalized` text,
	`ip_key` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`resolved_at` integer,
	CONSTRAINT "login_attempts_kind_check" CHECK("__new_login_attempts"."kind" IN ('CREDENTIAL', 'PASSWORD_CHANGE', 'CAPTCHA', 'HONEYPOT', 'MARKER')),
	CONSTRAINT "login_attempts_outcome_check" CHECK("__new_login_attempts"."outcome" IN ('PENDING', 'FAILED', 'SUCCESS', 'CLEARED'))
);
--> statement-breakpoint
INSERT INTO `__new_login_attempts`("id", "login_normalized", "ip_key", "kind", "outcome", "occurred_at", "resolved_at") SELECT "id", "login_normalized", "ip_key", "kind", "outcome", "occurred_at", "resolved_at" FROM `login_attempts`;--> statement-breakpoint
DROP TABLE `login_attempts`;--> statement-breakpoint
ALTER TABLE `__new_login_attempts` RENAME TO `login_attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `login_attempts_login_occurred_idx` ON `login_attempts` (`login_normalized`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_occurred_idx` ON `login_attempts` (`ip_key`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_occurred_at_idx` ON `login_attempts` (`occurred_at`);