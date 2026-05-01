ALTER TABLE `reconstruction_jobs` ADD `mode` enum('single','multi') DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE `reconstruction_jobs` ADD `sourceImageCount` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reconstruction_jobs` ADD `sourceImageUrls` text;