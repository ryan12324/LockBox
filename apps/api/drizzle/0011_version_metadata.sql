ALTER TABLE `vault_item_versions` ADD `folder_id` text;
--> statement-breakpoint
ALTER TABLE `vault_item_versions` ADD `tags` text;
--> statement-breakpoint
ALTER TABLE `vault_item_versions` ADD `favorite` integer DEFAULT 0;
--> statement-breakpoint
UPDATE `vault_item_versions`
SET
  `folder_id` = (
    SELECT `folder_id` FROM `vault_items` WHERE `vault_items`.`id` = `vault_item_versions`.`item_id`
  ),
  `tags` = (
    SELECT `tags` FROM `vault_items` WHERE `vault_items`.`id` = `vault_item_versions`.`item_id`
  ),
  `favorite` = COALESCE((
    SELECT `favorite` FROM `vault_items` WHERE `vault_items`.`id` = `vault_item_versions`.`item_id`
  ), 0);
