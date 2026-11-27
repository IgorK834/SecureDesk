CREATE TABLE `canary_webhook_receipts` (
	`digest` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `canary_webhook_receipts_received_at_idx` ON `canary_webhook_receipts` (`received_at`);--> statement-breakpoint
CREATE TABLE `loki_ship_cursor` (
	`id` integer PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`last_seq` integer NOT NULL,
	`last_hash` text NOT NULL,
	`lease_owner` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "loki_ship_cursor_singleton_check" CHECK("loki_ship_cursor"."id" = 1)
);
