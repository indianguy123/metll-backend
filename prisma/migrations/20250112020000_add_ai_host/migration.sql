-- CreateTable
CREATE TABLE "ChatHostSession" (
    "id" SERIAL NOT NULL,
    "chatRoomId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStage" TEXT,
    "user1OptIn" BOOLEAN NOT NULL DEFAULT false,
    "user2OptIn" BOOLEAN NOT NULL DEFAULT false,
    "stageData" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatHostSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatHostMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" INTEGER,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHostMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatHostSession_chatRoomId_key" ON "ChatHostSession"("chatRoomId");

-- CreateIndex
CREATE INDEX "ChatHostSession_matchId_idx" ON "ChatHostSession"("matchId");

-- CreateIndex
CREATE INDEX "ChatHostSession_status_idx" ON "ChatHostSession"("status");

-- CreateIndex
CREATE INDEX "ChatHostMessage_sessionId_createdAt_idx" ON "ChatHostMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatHostSession" ADD CONSTRAINT "ChatHostSession_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatHostMessage" ADD CONSTRAINT "ChatHostMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatHostSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

