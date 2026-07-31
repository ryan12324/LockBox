ALTER TABLE `vault_items` ADD `server_modified_at` text;
--> statement-breakpoint
UPDATE `vault_items`
SET `server_modified_at` = COALESCE(`deleted_at`, `revision_date`, `created_at`)
WHERE `server_modified_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `vault_items_user_server_modified_idx`
ON `vault_items` (`user_id`, `server_modified_at`);
