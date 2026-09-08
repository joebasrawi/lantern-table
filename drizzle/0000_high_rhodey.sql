CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`invite` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`lock` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_invite_unique` ON `campaigns` (`invite`);--> statement-breakpoint
CREATE TABLE `members` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);