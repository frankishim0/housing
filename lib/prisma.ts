import { PrismaClient } from '@prisma/client';
import { getLocalMockDatabaseUrl, isLocalMockPaymentsEnabled } from '@/lib/payments';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const datasourceUrl = isLocalMockPaymentsEnabled() ? getLocalMockDatabaseUrl() : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
