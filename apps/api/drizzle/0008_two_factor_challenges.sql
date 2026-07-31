CREATE TABLE `two_factor_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_challenges_token_unique` ON `two_factor_challenges` (`token`);
--> statement-breakpoint
CREATE INDEX `two_factor_challenges_user_idx` ON `two_factor_challenges` (`user_id`);
