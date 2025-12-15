/*
  Warnings:

  - The values [openai,gemini,claude] on the enum `AIModel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AIModel_new" AS ENUM ('gpt_4o', 'gpt_4o_mini');
ALTER TABLE "public"."User" ALTER COLUMN "aiModel" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "aiModel" TYPE "AIModel_new" USING ("aiModel"::text::"AIModel_new");
ALTER TABLE "Message" ALTER COLUMN "model" TYPE "AIModel_new" USING ("model"::text::"AIModel_new");
ALTER TABLE "Transaction" ALTER COLUMN "model" TYPE "AIModel_new" USING ("model"::text::"AIModel_new");
ALTER TYPE "AIModel" RENAME TO "AIModel_old";
ALTER TYPE "AIModel_new" RENAME TO "AIModel";
DROP TYPE "public"."AIModel_old";
ALTER TABLE "User" ALTER COLUMN "aiModel" SET DEFAULT 'gpt_4o';
COMMIT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "aiModel" SET DEFAULT 'gpt_4o';
