CREATE TABLE `daily_backdrops` (
	`day` text PRIMARY KEY,
	`image_url` text NOT NULL,
	`alt` text NOT NULL,
	`color` text,
	`fetched_at` integer NOT NULL
);
