-- Hand-edited: SQLite cannot add a NOT NULL column without a default to a
-- table with rows, so it starts at 0 and is filled from first_seen_at.
ALTER TABLE `articles` ADD `surfaced_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `articles` SET `surfaced_at` = `first_seen_at`;--> statement-breakpoint
ALTER TABLE `articles` ADD `text_length` integer;--> statement-breakpoint
ALTER TABLE `feeds` ADD `show_updates` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pruned_items` ADD `text_length` integer;--> statement-breakpoint
ALTER TABLE `pruned_items` ADD `first_seen_at` integer;--> statement-breakpoint
DROP INDEX IF EXISTS `articles_first_seen`;--> statement-breakpoint
CREATE INDEX `articles_surfaced` ON `articles` (`surfaced_at`);