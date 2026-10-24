ALTER TABLE `review_logs` ADD `state` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_logs` ADD `stability` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_logs` ADD `difficulty` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_logs` ADD `scheduled_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_logs` ADD `due` integer;