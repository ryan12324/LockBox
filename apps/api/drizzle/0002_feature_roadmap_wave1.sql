-- Wave 1: Account 2FA support
-- user_totp_settings: TOTP secret storage for account-level 2FA
-- backup_codes: Single-use recovery codes for 2FA

CREATE TABLE `user_totp_settings` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`),
	`encrypted_totp_secret` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `backup_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`code_hash` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
