import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
const prismaGlobal = global;

let prisma;

if (typeof window === 'undefined') {
  if (!prismaGlobal.prisma) {
    prismaGlobal.prisma = new PrismaClient();
  }
  prisma = prismaGlobal.prisma;
}

export default prisma;
