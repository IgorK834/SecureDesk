CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_code_unique` ON `permissions` (`code`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`login_normalized` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer NOT NULL,
	`temporary_password_expires_at` integer,
	`password_changed_at` integer,
	`is_blocked` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_normalized_unique` ON `users` (`login_normalized`);--> statement-breakpoint
CREATE TABLE `password_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `password_history_user_id_idx` ON `password_history` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`auth_stage` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_auth_stage_check" CHECK("sessions"."auth_stage" IN ('INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED', 'FULLY_AUTHENTICATED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_last_activity_at_idx` ON `sessions` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `security_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`min_password_length` integer DEFAULT 12 NOT NULL,
	`reject_personal_data_in_password` integer DEFAULT false NOT NULL,
	`password_max_age_days` integer,
	`session_idle_timeout_minutes` integer DEFAULT 15 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_settings_singleton_check" CHECK("security_settings"."id" = 1),
	CONSTRAINT "security_settings_min_password_length_check" CHECK("security_settings"."min_password_length" >= 12)
);
