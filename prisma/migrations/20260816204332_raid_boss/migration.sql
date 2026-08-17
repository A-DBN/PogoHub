-- CreateEnum
CREATE TYPE "RaidKind" AS ENUM ('RAID', 'MEGA_RAID', 'SHADOW_RAID', 'ELITE_RAID', 'MAX_BATTLE', 'GIGANTAMAX');

-- CreateTable
CREATE TABLE "RaidBoss" (
    "id" TEXT NOT NULL,
    "pokemonId" TEXT,
    "externalName" TEXT NOT NULL,
    "kind" "RaidKind" NOT NULL DEFAULT 'RAID',
    "tier" TEXT NOT NULL,
    "tierLevel" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "canBeShiny" BOOLEAN NOT NULL DEFAULT false,
    "types" TEXT[],
    "cpMin" INTEGER,
    "cpMax" INTEGER,
    "cpBoostedMin" INTEGER,
    "cpBoostedMax" INTEGER,
    "boostedWeather" TEXT[],
    "image" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "sourceEventId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaidBoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaidBoss_isCurrent_tierLevel_idx" ON "RaidBoss"("isCurrent", "tierLevel");

-- CreateIndex
CREATE UNIQUE INDEX "RaidBoss_externalName_kind_tier_key" ON "RaidBoss"("externalName", "kind", "tier");

-- AddForeignKey
ALTER TABLE "RaidBoss" ADD CONSTRAINT "RaidBoss_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
