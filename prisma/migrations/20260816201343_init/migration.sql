-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'CONTRIBUTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MoveKind" AS ENUM ('FAST', 'CHARGED');

-- CreateEnum
CREATE TYPE "LeagueTier" AS ENUM ('MAIN', 'MINOR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MetaCategory" AS ENUM ('OVERALL', 'LEADS', 'CLOSERS', 'SWITCHES', 'CHARGERS', 'ATTACKERS');

-- CreateEnum
CREATE TYPE "MetaSource" AS ENUM ('PVPOKE', 'GOBATTLELOG', 'MANUAL');

-- CreateEnum
CREATE TYPE "NewsSource" AS ENUM ('LEEKDUCK', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pokemon" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "dex" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "form" TEXT,
    "formFr" TEXT,
    "isShadow" BOOLEAN NOT NULL DEFAULT false,
    "shadowEligible" BOOLEAN NOT NULL DEFAULT false,
    "types" TEXT[],
    "baseAtk" INTEGER NOT NULL,
    "baseDef" INTEGER NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "tags" TEXT[],
    "familyId" TEXT,
    "parentSpeciesId" TEXT,
    "evolutionIds" TEXT[],
    "buddyKm" INTEGER,
    "thirdMoveCost" INTEGER,
    "thirdMoveStardust" INTEGER,
    "eliteMoves" TEXT[],
    "iconFile" TEXT NOT NULL,
    "shinyIconFile" TEXT,
    "generation" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Move" (
    "id" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "kind" "MoveKind" NOT NULL,
    "power" INTEGER NOT NULL DEFAULT 0,
    "energy" INTEGER NOT NULL DEFAULT 0,
    "energyGain" INTEGER NOT NULL DEFAULT 0,
    "turns" INTEGER NOT NULL DEFAULT 1,
    "buffs" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokemonMove" (
    "pokemonId" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "isElite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PokemonMove_pkey" PRIMARY KEY ("pokemonId","moveId")
);

-- CreateTable
CREATE TABLE "ShinyRelease" (
    "pokemonId" TEXT NOT NULL,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "sources" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShinyRelease_pkey" PRIMARY KEY ("pokemonId")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cup" TEXT NOT NULL DEFAULT 'all',
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "cpLimit" INTEGER,
    "tier" "LeagueTier" NOT NULL DEFAULT 'MINOR',
    "color" TEXT NOT NULL DEFAULT '#5b9cff',
    "icon" TEXT,
    "rulesEn" TEXT[],
    "rulesFr" TEXT[],
    "filters" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaSnapshot" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "source" "MetaSource" NOT NULL DEFAULT 'PVPOKE',
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MetaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaEntry" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "category" "MetaCategory" NOT NULL DEFAULT 'OVERALL',
    "pokemonId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rating" INTEGER,
    "moveset" JSONB NOT NULL,
    "moveUses" JSONB,
    "matchups" JSONB,
    "counters" JSONB,
    "scores" JSONB,
    "source" "MetaSource" NOT NULL DEFAULT 'PVPOKE',
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "editedById" TEXT,
    "snapshotId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5b9cff',
    "leagueId" TEXT,
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "pokemonId" TEXT NOT NULL,
    "isShadow" BOOLEAN NOT NULL DEFAULT false,
    "isShiny" BOOLEAN NOT NULL DEFAULT false,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "ivAtk" INTEGER NOT NULL DEFAULT 15,
    "ivDef" INTEGER NOT NULL DEFAULT 15,
    "ivHp" INTEGER NOT NULL DEFAULT 15,
    "fastMoveId" TEXT,
    "charged1Id" TEXT,
    "charged2Id" TEXT,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionEntry" (
    "userId" TEXT NOT NULL,
    "pokemonId" TEXT NOT NULL,
    "owned" BOOLEAN NOT NULL DEFAULT false,
    "needed" BOOLEAN NOT NULL DEFAULT false,
    "shinyCaught" BOOLEAN NOT NULL DEFAULT false,
    "caughtAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionEntry_pkey" PRIMARY KEY ("userId","pokemonId")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" "NewsSource" NOT NULL DEFAULT 'LEEKDUCK',
    "type" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleFr" TEXT,
    "image" TEXT,
    "link" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "payload" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "counts" JSONB,
    "error" TEXT,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Pokemon_speciesId_key" ON "Pokemon"("speciesId");

-- CreateIndex
CREATE INDEX "Pokemon_dex_idx" ON "Pokemon"("dex");

-- CreateIndex
CREATE INDEX "Pokemon_nameEn_idx" ON "Pokemon"("nameEn");

-- CreateIndex
CREATE INDEX "Pokemon_nameFr_idx" ON "Pokemon"("nameFr");

-- CreateIndex
CREATE UNIQUE INDEX "Move_moveId_key" ON "Move"("moveId");

-- CreateIndex
CREATE INDEX "PokemonMove_moveId_idx" ON "PokemonMove"("moveId");

-- CreateIndex
CREATE UNIQUE INDEX "League_key_key" ON "League"("key");

-- CreateIndex
CREATE INDEX "League_tier_sortOrder_idx" ON "League"("tier", "sortOrder");

-- CreateIndex
CREATE INDEX "MetaSnapshot_leagueId_takenAt_idx" ON "MetaSnapshot"("leagueId", "takenAt");

-- CreateIndex
CREATE INDEX "MetaEntry_leagueId_category_rank_idx" ON "MetaEntry"("leagueId", "category", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "MetaEntry_leagueId_category_pokemonId_key" ON "MetaEntry"("leagueId", "category", "pokemonId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_shareSlug_key" ON "Team"("shareSlug");

-- CreateIndex
CREATE INDEX "Team_userId_idx" ON "Team"("userId");

-- CreateIndex
CREATE INDEX "Team_isPublic_idx" ON "Team"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_slot_key" ON "TeamMember"("teamId", "slot");

-- CreateIndex
CREATE INDEX "CollectionEntry_userId_shinyCaught_idx" ON "CollectionEntry"("userId", "shinyCaught");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_externalId_key" ON "NewsItem"("externalId");

-- CreateIndex
CREATE INDEX "NewsItem_startAt_idx" ON "NewsItem"("startAt");

-- CreateIndex
CREATE INDEX "NewsItem_endAt_idx" ON "NewsItem"("endAt");

-- CreateIndex
CREATE INDEX "IngestRun_kind_startedAt_idx" ON "IngestRun"("kind", "startedAt");

-- AddForeignKey
ALTER TABLE "PokemonMove" ADD CONSTRAINT "PokemonMove_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokemonMove" ADD CONSTRAINT "PokemonMove_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "Move"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShinyRelease" ADD CONSTRAINT "ShinyRelease_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaSnapshot" ADD CONSTRAINT "MetaSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEntry" ADD CONSTRAINT "MetaEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEntry" ADD CONSTRAINT "MetaEntry_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEntry" ADD CONSTRAINT "MetaEntry_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEntry" ADD CONSTRAINT "MetaEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MetaSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
