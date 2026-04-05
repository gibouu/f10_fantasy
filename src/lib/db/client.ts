import { PrismaClient } from "@prisma/client";

// Extend the global type to hold the cached client in dev.
// This prevents multiple PrismaClient instances from being created
// during Next.js hot-reload in development.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// In production we always create a fresh client bound to the module.
// In development we reuse the instance stored on `globalThis` so that
// hot-module replacement doesn't exhaust the DB connection pool.
export const db: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
