CREATE TABLE `reconstruction_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`sourceImageUrl` text,
	`sourceImageKey` varchar(512),
	`modelUrl` text,
	`modelKey` varchar(512),
	`thumbnailUrl` text,
	`progress` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`processingTimeMs` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reconstruction_jobs_id` PRIMARY KEY(`id`)
);
