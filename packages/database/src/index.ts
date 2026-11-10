import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export { Prisma, PrismaClient };
export type Transaction = Prisma.TransactionClient;
export function createDatabase(url: string) {
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL PostgreSQL obrigatória.');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    }),
    log: [],
  });
}
export async function transaction<T>(
  db: PrismaClient,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034' ||
        attempt >= 3
      )
        throw error;
    }
  }
}
export async function lock(tx: Transaction, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
