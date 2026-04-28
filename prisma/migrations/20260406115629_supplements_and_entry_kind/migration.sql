-- AlterTable
ALTER TABLE "FoodLogEntry" ADD COLUMN     "entryKind" TEXT NOT NULL DEFAULT 'food';

-- CreateTable
CREATE TABLE "SupplementAdvice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3),
    "items" JSONB NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplementAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplementAdvice_userId_key" ON "SupplementAdvice"("userId");

-- AddForeignKey
ALTER TABLE "SupplementAdvice" ADD CONSTRAINT "SupplementAdvice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
