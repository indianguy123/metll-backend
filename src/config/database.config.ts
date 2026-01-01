import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'],
});

export default prisma;





// # Apply migrations to production database
// npx prisma migrate deploy

// # Generate Prisma Client after schema changes
// npx prisma generate

// # View your database in GUI
// npx prisma studio

// # Check migration status
// npx prisma migrate status
