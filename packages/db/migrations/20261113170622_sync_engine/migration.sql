CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`feed_id` integer NOT NULL,
	`item_key` text NOT NULL,
	`url` text,
	`title` text,
	`author` text,
	`content_html` text,
	`excerpt` text,
	`published_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content_hash` text NOT NULL,
	`read_at` integer,
	`read_action_id` text,
	CONSTRAINT `fk_articles_feed_id_feeds_id_fk` FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`url` text NOT NULL,
	`title` text,
	`custom_title` text,
	`site_url` text,
	`created_at` integer NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_fetched_at` integer,
	`last_outcome` text,
	`last_http_status` integer,
	`last_success_at` integer,
	`last_changed_at` integer,
	`last_published_at` integer,
	`first_failure_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `pruned_items` (
	`feed_id` integer NOT NULL,
	`item_key` text NOT NULL,
	`pruned_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	CONSTRAINT `pruned_items_pk` PRIMARY KEY(`feed_id`, `item_key`),
	CONSTRAINT `fk_pruned_items_feed_id_feeds_id_fk` FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `sync_state` ADD `run_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `articles_feed_item_unique` ON `articles` (`feed_id`,`item_key`);--> statement-breakpoint
CREATE INDEX `articles_unread_by_published` ON `articles` (`read_at`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `articles_feed_unread_by_published` ON `articles` (`feed_id`,`read_at`,`published_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);--> statement-breakpoint
CREATE INDEX `feeds_last_fetched_at` ON `feeds` (`last_fetched_at`);--> statement-breakpoint
CREATE INDEX `pruned_items_last_seen_at` ON `pruned_items` (`last_seen_at`);