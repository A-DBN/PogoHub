-- CreateEnum
CREATE TYPE "TrainerTeam" AS ENUM ('VALOR', 'MYSTIC', 'INSTINCT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "friendCode" TEXT,
ADD COLUMN     "friendCodePublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "team" "TrainerTeam",
ADD COLUMN     "teamsPublicByDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainerLevel" INTEGER;
