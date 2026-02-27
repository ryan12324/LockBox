CREATE TABLE `user_key_pairs` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`),
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL REFERENCES `users`(`id`),
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL REFERENCES `teams`(`id`),
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`role` text NOT NULL DEFAULT 'member',
	`custom_permissions` text,
	`created_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY(`team_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL REFERENCES `teams`(`id`),
	`email` text NOT NULL,
	`token` text NOT NULL UNIQUE,
	`role` text NOT NULL DEFAULT 'member',
	`created_by` text NOT NULL REFERENCES `users`(`id`),
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `shared_folders` (
	`folder_id` text NOT NULL REFERENCES `folders`(`id`),
	`team_id` text NOT NULL REFERENCES `teams`(`id`),
	`owner_user_id` text NOT NULL REFERENCES `users`(`id`),
	`permission_level` text NOT NULL DEFAULT 'read_write',
	`created_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY(`folder_id`, `team_id`)
);
--> statement-breakpoint
CREATE TABLE `shared_folder_keys` (
	`folder_id` text NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`encrypted_folder_key` text NOT NULL,
	`granted_by` text NOT NULL REFERENCES `users`(`id`),
	`granted_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY(`folder_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`encrypted_item` text NOT NULL,
	`token_hash` text NOT NULL,
	`item_name` text NOT NULL,
	`max_views` integer NOT NULL DEFAULT 1,
	`view_count` integer NOT NULL DEFAULT 0,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
