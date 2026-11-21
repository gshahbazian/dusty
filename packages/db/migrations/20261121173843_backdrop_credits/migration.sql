-- The table is a one-day cache of an Unsplash answer, so it is rebuilt
-- rather than altered: a kept photo without its credit can't be shown, and
-- SQLite can't add a NOT NULL column without a default. The day's next
-- empty pane fetches the photo again, credit and all.
DROP TABLE `daily_backdrops`;--> statement-breakpoint
CREATE TABLE `daily_backdrops` (
	`day` text PRIMARY KEY,
	`image_url` text NOT NULL,
	`alt` text NOT NULL,
	`color` text,
	`photographer_name` text NOT NULL,
	`photographer_url` text NOT NULL,
	`photo_url` text NOT NULL,
	`fetched_at` integer NOT NULL
);
