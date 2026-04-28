import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

function isStalePrismaClient(c: PrismaClient): boolean {
  const d = c as unknown as { supplementAdvice?: { findUnique?: unknown } };
  return typeof d.supplementAdvice?.findUnique !== "function";
}

let prismaInstance: PrismaClient;

const cached = globalForPrisma.prisma;
if (cached && !isStalePrismaClient(cached)) {
  prismaInstance = cached;
} else {
  if (cached) {
    void cached.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
  }
  prismaInstance = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance;
  }
}

export const prisma = prismaInstance;
