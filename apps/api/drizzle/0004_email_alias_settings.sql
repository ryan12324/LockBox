CREATE TABLE `alias_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`base_url` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
