ALTER TABLE `diary_entries` ADD `author_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `edited_at` text;--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `editor_email` text;--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `editor_name` text;