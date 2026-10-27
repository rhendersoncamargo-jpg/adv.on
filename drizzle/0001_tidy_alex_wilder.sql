CREATE TABLE `useful_phones` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`phone` text NOT NULL,
	`extension` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`entity_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
