CREATE TABLE `audit_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_user_id` text,
	`actor_login` text,
	`subject_login` text,
	`subject_ref` text,
	`ip` text,
	`action` text NOT NULL,
	`description` text NOT NULL,
	`outcome` text NOT NULL,
	`details` text NOT NULL,
	`request_id` text NOT NULL,
	`prev_hash` text NOT NULL,
	`entry_hash` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_log_actor_type_check" CHECK("audit_log"."actor_type" IN ('USER', 'ANONYMOUS', 'SYSTEM')),
	CONSTRAINT "audit_log_outcome_check" CHECK("audit_log"."outcome" IN ('SUCCESS', 'FAILURE')),
	CONSTRAINT "audit_log_prev_hash_length_check" CHECK(length("audit_log"."prev_hash") = 64),
	CONSTRAINT "audit_log_entry_hash_length_check" CHECK(length("audit_log"."entry_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_id_unique` ON `audit_log` (`id`);--> statement-breakpoint
CREATE INDEX `audit_log_occurred_at_idx` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_action_occurred_at_idx` ON `audit_log` (`action`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_user_id_occurred_at_idx` ON `audit_log` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_subject_login_occurred_at_idx` ON `audit_log` (`subject_login`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_subject_ref_occurred_at_idx` ON `audit_log` (`subject_ref`,`occurred_at`);