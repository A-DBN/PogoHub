/*
  Warnings:

  - You are about to drop the column `before` on the `MetaProposal` table. All the data in the column will be lost.
  - You are about to drop the column `moveset` on the `MetaProposal` table. All the data in the column will be lost.
  - You are about to drop the column `pokemonId` on the `MetaProposal` table. All the data in the column will be lost.
  - You are about to drop the column `rank` on the `MetaProposal` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `MetaProposal` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "MetaProposal" DROP CONSTRAINT "MetaProposal_pokemonId_fkey";

-- AlterTable
ALTER TABLE "MetaProposal" DROP COLUMN "before",
DROP COLUMN "moveset",
DROP COLUMN "pokemonId",
DROP COLUMN "rank",
DROP COLUMN "score",
ADD COLUMN     "snapshotId" TEXT;

-- CreateTable
CREATE TABLE "MetaProposalChange" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "pokemonId" TEXT NOT NULL,
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "moveset" JSONB,
    "beforeRank" INTEGER,
    "beforeScore" DOUBLE PRECISION,
    "beforeMoveset" JSONB,

    CONSTRAINT "MetaProposalChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaProposalChange_proposalId_pokemonId_key" ON "MetaProposalChange"("proposalId", "pokemonId");

-- AddForeignKey
ALTER TABLE "MetaProposal" ADD CONSTRAINT "MetaProposal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MetaSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposalChange" ADD CONSTRAINT "MetaProposalChange_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MetaProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposalChange" ADD CONSTRAINT "MetaProposalChange_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
