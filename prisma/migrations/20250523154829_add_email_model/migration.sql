/*
  Warnings:

  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "type" SET DEFAULT 'oauth';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT;

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "VerificationToken";

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT NOT NULL,
    "recipients" TEXT[],
    "body" TEXT,
    "bodyHtml" TEXT,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_messageId_key" ON "Email"("messageId");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
