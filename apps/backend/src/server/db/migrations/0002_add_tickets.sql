CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`assigned_to_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tickets_status_check" CHECK("tickets"."status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
);
--> statement-breakpoint
CREATE INDEX `tickets_created_by_user_id_idx` ON `tickets` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `tickets_assigned_to_user_id_idx` ON `tickets` (`assigned_to_user_id`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);