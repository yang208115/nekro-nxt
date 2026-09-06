ALTER TABLE `channel_bindings` ADD `activity_trigger_suppressions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `activity_trigger_defaults` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `archived_at` integer;