-- AlterTable
ALTER TABLE "MetaEntry" ADD COLUMN     "ivs" JSONB;

-- AlterTable
ALTER TABLE "MetaProposalChange" ADD COLUMN     "beforeIvs" JSONB,
ADD COLUMN     "ivs" JSONB;
