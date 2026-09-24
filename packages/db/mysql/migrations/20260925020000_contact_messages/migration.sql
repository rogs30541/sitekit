-- CreateTable
CREATE TABLE `contact_messages` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` TEXT NULL,
    `subject` TEXT NULL,
    `message` TEXT NOT NULL,
    `page` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'new',
    `note` TEXT NULL,
    `ip` TEXT NULL,
    `userAgent` TEXT NULL,
    `repliedAt` DATETIME(3) NULL,
    `repliedBy` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contact_messages_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `contact_messages_email_createdAt_idx`(`email`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
