ALTER TABLE `channel_bindings` RENAME COLUMN "event_triggers" TO "activity_triggers";--> statement-breakpoint
ALTER TABLE `channel_events` RENAME COLUMN "activity_type" TO "activity_key";--> statement-breakpoint
CREATE TABLE `connection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`activity_key` text NOT NULL,
	`summary` text NOT NULL,
	`actor_identity_id` text,
	`subject_identity_id` text,
	`source_timestamp` integer NOT NULL,
	`received_at` integer NOT NULL,
	`dedupe_key` text NOT NULL,
	`facts` text,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_identity_id`) REFERENCES `platform_identities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_identity_id`) REFERENCES `platform_identities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_events_connection_dedupe_uq` ON `connection_events` (`connection_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `connection_events_history_idx` ON `connection_events` (`connection_id`,`received_at`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`platform_channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`auto_created_for_agent_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`auto_created_for_agent_id`) REFERENCES `agent_definitions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "channels_kind_ck" CHECK("__new_channels"."kind" IN ('internal', 'direct', 'group'))
);
--> statement-breakpoint
INSERT INTO `__new_channels`("id", "connection_id", "platform_channel_id", "kind", "display_name", "auto_created_for_agent_id", "created_at", "deleted_at") SELECT "id", "connection_id", "platform_channel_id", CASE "kind" WHEN 'web' THEN 'internal' ELSE "kind" END, "display_name", "auto_created_for_agent_id", "created_at", "deleted_at" FROM `channels`;--> statement-breakpoint
DROP TABLE `channels`;--> statement-breakpoint
ALTER TABLE `__new_channels` RENAME TO `channels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `channels_connection_platform_uq` ON `channels` (`connection_id`,`platform_channel_id`);
