DELETE FROM `two_factor_challenges`
WHERE `rowid` NOT IN (
  SELECT MAX(`rowid`) FROM `two_factor_challenges` GROUP BY `user_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_challenges_user_unique`
ON `two_factor_challenges` (`user_id`);
