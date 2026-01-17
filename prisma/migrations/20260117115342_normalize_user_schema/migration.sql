/*
  Warnings:

  - You are about to drop the column `additionalPhotoIds` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `additionalPhotos` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `age` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bio` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `college` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `faceId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `homeLocation` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `imagePublicIds` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `images` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `livenessSessionId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `office` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `profilePhoto` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `profilePhotoPublicId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `school` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `situationResponses` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationDate` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationScore` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationStatus` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationVideo` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationVideoId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_verificationStatus_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "additionalPhotoIds",
DROP COLUMN "additionalPhotos",
DROP COLUMN "age",
DROP COLUMN "bio",
DROP COLUMN "college",
DROP COLUMN "faceId",
DROP COLUMN "gender",
DROP COLUMN "homeLocation",
DROP COLUMN "imagePublicIds",
DROP COLUMN "images",
DROP COLUMN "latitude",
DROP COLUMN "livenessSessionId",
DROP COLUMN "longitude",
DROP COLUMN "office",
DROP COLUMN "profilePhoto",
DROP COLUMN "profilePhotoPublicId",
DROP COLUMN "school",
DROP COLUMN "situationResponses",
DROP COLUMN "verificationDate",
DROP COLUMN "verificationScore",
DROP COLUMN "verificationStatus",
DROP COLUMN "verificationVideo",
DROP COLUMN "verificationVideoId",
ADD COLUMN     "isDiscoverOnboarded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bio" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "height" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "currentCity" TEXT,
    "pastCity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSchool" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "class" TEXT,
    "section" TEXT,

    CONSTRAINT "UserSchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCollege" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,

    CONSTRAINT "UserCollege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOffice" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "location" TEXT,

    CONSTRAINT "UserOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPhoto" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "videoUrl" TEXT,
    "videoPublicId" TEXT,
    "faceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" DOUBLE PRECISION,
    "verifiedAt" TIMESTAMP(3),
    "livenessSession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatingPreferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'open_to_all',
    "datingIntention" TEXT NOT NULL DEFAULT 'open_to_all',
    "genderPreference" TEXT[] DEFAULT ARRAY['all']::TEXT[],
    "ageMin" INTEGER NOT NULL DEFAULT 18,
    "ageMax" INTEGER NOT NULL DEFAULT 50,
    "distanceMax" INTEGER NOT NULL DEFAULT 50,
    "children" TEXT,
    "familyPlans" TEXT,
    "smoking" TEXT,
    "drinking" TEXT,
    "drugs" TEXT,
    "politics" TEXT,
    "education" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalityResponse" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalityResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reportedId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_gender_idx" ON "UserProfile"("gender");

-- CreateIndex
CREATE INDEX "UserProfile_currentCity_idx" ON "UserProfile"("currentCity");

-- CreateIndex
CREATE UNIQUE INDEX "UserSchool_profileId_key" ON "UserSchool"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCollege_profileId_key" ON "UserCollege"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOffice_profileId_key" ON "UserOffice"("profileId");

-- CreateIndex
CREATE INDEX "UserPhoto_userId_type_idx" ON "UserPhoto"("userId", "type");

-- CreateIndex
CREATE INDEX "UserPhoto_userId_order_idx" ON "UserPhoto"("userId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "UserVerification_userId_key" ON "UserVerification"("userId");

-- CreateIndex
CREATE INDEX "UserVerification_status_idx" ON "UserVerification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DatingPreferences_userId_key" ON "DatingPreferences"("userId");

-- CreateIndex
CREATE INDEX "PersonalityResponse_userId_idx" ON "PersonalityResponse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalityResponse_userId_questionId_key" ON "PersonalityResponse"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Report_reportedId_idx" ON "Report"("reportedId");

-- CreateIndex
CREATE INDEX "User_isOnboarded_idx" ON "User"("isOnboarded");

-- CreateIndex
CREATE INDEX "User_isDiscoverOnboarded_idx" ON "User"("isDiscoverOnboarded");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSchool" ADD CONSTRAINT "UserSchool_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCollege" ADD CONSTRAINT "UserCollege_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOffice" ADD CONSTRAINT "UserOffice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPhoto" ADD CONSTRAINT "UserPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVerification" ADD CONSTRAINT "UserVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatingPreferences" ADD CONSTRAINT "DatingPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalityResponse" ADD CONSTRAINT "PersonalityResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
