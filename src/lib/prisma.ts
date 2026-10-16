import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaKeepAliveStarted: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;

if (
  !globalForPrisma.prismaKeepAliveStarted &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  globalForPrisma.prismaKeepAliveStarted = true;
  const warmPool = () => {
    void Promise.all([
      prisma.$queryRawUnsafe("SELECT 1"),
      prisma.$queryRawUnsafe("SELECT 1"),
      prisma.$queryRawUnsafe("SELECT 1"),
    ]).catch(() => {});
  };
  warmPool();
  const timer = setInterval(warmPool, 25_000);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export default prisma;
