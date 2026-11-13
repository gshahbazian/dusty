CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY,
	`last_started_at` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`last_finished_at` integer,
	`last_trigger` text,
	`last_outcome` text
);
