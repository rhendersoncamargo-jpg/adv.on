CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_plate_unique` ON `vehicles` (`plate`) WHERE `plate` <> '';
--> statement-breakpoint
CREATE TABLE `vehicle_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`used_at` text NOT NULL,
	`km_start` integer NOT NULL,
	`km_end` integer NOT NULL,
	`route` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`edited_at` text,
	`editor_email` text,
	`editor_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vehicle_logs_vehicle_used_idx` ON `vehicle_logs` (`vehicle_id`,`used_at`);
