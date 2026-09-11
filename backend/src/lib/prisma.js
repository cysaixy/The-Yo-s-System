import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const datasourceUrl =
  process.env.POSTGRES_URL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

export const prisma = globalForPrisma.prisma || new PrismaClient({
  ...(datasourceUrl ? { datasourceUrl } : {}),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;