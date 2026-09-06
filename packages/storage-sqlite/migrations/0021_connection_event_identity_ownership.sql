PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_connection_events` (
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
	FOREIGN KEY (`actor_identity_id`,`connection_id`) REFERENCES `platform_identities`(`id`,`connection_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_identity_id`,`connection_id`) REFERENCES `platform_identities`(`id`,`connection_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_connection_events`("id", "connection_id", "activity_key", "summary", "actor_identity_id", "subject_identity_id", "source_timestamp", "received_at", "dedupe_key", "facts") SELECT "id", "connection_id", "activity_key", "summary", "actor_identity_id", "subject_identity_id", "source_timestamp", "received_at", "dedupe_key", "facts" FROM `connection_events`;--> statement-breakpoint
DROP TABLE `connection_events`;--> statement-breakpoint
ALTER TABLE `__new_connection_events` RENAME TO `connection_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `connection_events_connection_dedupe_uq` ON `connection_events` (`connection_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `connection_events_history_idx` ON `connection_events` (`connection_id`,`received_at`,`id`);