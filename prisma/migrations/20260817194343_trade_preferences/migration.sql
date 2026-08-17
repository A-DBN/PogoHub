-- AlterTable
ALTER TABLE "CollectionEntry" ALTER COLUMN "forTrade" DROP NOT NULL,
ALTER COLUMN "forTrade" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoTradeFrom" INTEGER,
ADD COLUMN     "tradeNote" TEXT,
ADD COLUMN     "tradeOpen" BOOLEAN NOT NULL DEFAULT true;
