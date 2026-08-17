-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('UPDATE', 'ADD', 'REMOVE');

-- AlterTable
ALTER TABLE "MetaProposalChange" ADD COLUMN     "kind" "ChangeKind" NOT NULL DEFAULT 'UPDATE';
