-- CreateTable
CREATE TABLE "WeeklyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "nutritionScore" INTEGER NOT NULL,
    "workoutScore" INTEGER NOT NULL,
    "checkinScore" INTEGER NOT NULL,
    "consistencyScore" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "coachingRecap" TEXT NOT NULL DEFAULT '',
    "highlights" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memory" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL DEFAULT 'atlas',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationMemoryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalizationMemoryId" TEXT,
    "eventType" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizationMemoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScore_userId_weekStart_key" ON "WeeklyScore"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyScore_userId_createdAt_idx" ON "WeeklyScore"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizationMemory_userId_key" ON "PersonalizationMemory"("userId");

-- CreateIndex
CREATE INDEX "PersonalizationMemoryEvent_userId_createdAt_idx" ON "PersonalizationMemoryEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_dismissed_createdAt_idx" ON "Notification"("userId", "dismissed", "createdAt");

-- AddForeignKey
ALTER TABLE "WeeklyScore" ADD CONSTRAINT "WeeklyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationMemory" ADD CONSTRAINT "PersonalizationMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationMemoryEvent" ADD CONSTRAINT "PersonalizationMemoryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
