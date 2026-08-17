-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "MetaProposal" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "category" "MetaCategory" NOT NULL DEFAULT 'OVERALL',
    "pokemonId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "moveset" JSONB,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "authorId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaProposalVote" (
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaProposalVote_pkey" PRIMARY KEY ("proposalId","userId")
);

-- CreateIndex
CREATE INDEX "MetaProposal_status_createdAt_idx" ON "MetaProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MetaProposal_leagueId_category_idx" ON "MetaProposal"("leagueId", "category");

-- AddForeignKey
ALTER TABLE "MetaProposal" ADD CONSTRAINT "MetaProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposal" ADD CONSTRAINT "MetaProposal_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposal" ADD CONSTRAINT "MetaProposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposalVote" ADD CONSTRAINT "MetaProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MetaProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProposalVote" ADD CONSTRAINT "MetaProposalVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
