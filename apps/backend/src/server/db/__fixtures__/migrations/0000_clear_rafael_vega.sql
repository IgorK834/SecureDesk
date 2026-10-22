CREATE TABLE `fixture_children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `fixture_parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fixture_parents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixture_parents_name_unique` ON `fixture_parents` (`name`);