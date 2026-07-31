DELETE FROM `team_invites`
WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`)
  FROM `team_invites`
  GROUP BY `team_id`, `email`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_team_email_unique`
ON `team_invites` (`team_id`, `email`);
