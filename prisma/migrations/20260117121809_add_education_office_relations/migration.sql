/*
  Warnings:

  - You are about to drop the column `profileId` on the `UserCollege` table. All the data in the column will be lost.
  - You are about to drop the column `profileId` on the `UserOffice` table. All the data in the column will be lost.
  - You are about to drop the column `profileId` on the `UserSchool` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `UserCollege` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `UserOffice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `UserSchool` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `UserCollege` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `UserOffice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `UserSchool` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserCollege" DROP CONSTRAINT "UserCollege_profileId_fkey";

-- DropForeignKey
ALTER TABLE "UserOffice" DROP CONSTRAINT "UserOffice_profileId_fkey";

-- DropForeignKey
ALTER TABLE "UserSchool" DROP CONSTRAINT "UserSchool_profileId_fkey";

-- DropIndex
DROP INDEX "UserCollege_profileId_key";

-- DropIndex
DROP INDEX "UserOffice_profileId_key";

-- DropIndex
DROP INDEX "UserSchool_profileId_key";

-- AlterTable
ALTER TABLE "UserCollege" DROP COLUMN "profileId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "UserOffice" DROP COLUMN "profileId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "UserSchool" DROP COLUMN "profileId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserCollege_userId_key" ON "UserCollege"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOffice_userId_key" ON "UserOffice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSchool_userId_key" ON "UserSchool"("userId");

-- AddForeignKey
ALTER TABLE "UserSchool" ADD CONSTRAINT "UserSchool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCollege" ADD CONSTRAINT "UserCollege_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOffice" ADD CONSTRAINT "UserOffice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
