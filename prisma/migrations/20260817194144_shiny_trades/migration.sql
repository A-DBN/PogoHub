-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('REQUESTED', 'PROPOSED', 'ACCEPTED', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CollectionEntry" ADD COLUMN     "forTrade" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'REQUESTED',
    "wantedPokemonId" TEXT NOT NULL,
    "offeredPokemonId" TEXT,
    "requesterDone" BOOLEAN NOT NULL DEFAULT false,
    "ownerDone" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_requesterId_status_idx" ON "Trade"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Trade_ownerId_status_idx" ON "Trade"("ownerId", "status");

-- CreateIndex
CREATE INDEX "CollectionEntry_userId_forTrade_idx" ON "CollectionEntry"("userId", "forTrade");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_wantedPokemonId_fkey" FOREIGN KEY ("wantedPokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_offeredPokemonId_fkey" FOREIGN KEY ("offeredPokemonId") REFERENCES "Pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
