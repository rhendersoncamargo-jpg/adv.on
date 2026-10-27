CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'Reunião' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`location` text DEFAULT '' NOT NULL,
	`entity_id` text,
	`status` text DEFAULT 'Agendado' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `diary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`body` text NOT NULL,
	`author_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `diary_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`entity_id` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `diary_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `entity_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`category_id` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`label` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`source_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);