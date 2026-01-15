-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "coffeeTicket" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "coffeeTicketCafe" TEXT,
ADD COLUMN     "coffeeTicketExpiry" TIMESTAMP(3);
