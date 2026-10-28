ALTER TABLE `users` ADD `password_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` text;
