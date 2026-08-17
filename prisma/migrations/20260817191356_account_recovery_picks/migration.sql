-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recoveryHash" TEXT,
ADD COLUMN     "recoveryLockedUntil" TIMESTAMP(3);
