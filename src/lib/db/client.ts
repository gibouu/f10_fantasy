import { PrismaClient } from "@prisma/client";
import {
  decryptTokenValue,
  encryptTokenValue,
} from "@/lib/security/account-token-crypto";
import { transformTokenFields } from "@/lib/db/token-field-transform";

// Extend the global type to hold the cached client in dev.
// This prevents multiple PrismaClient instances from being created
// during Next.js hot-reload in development.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const prisma = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args?: unknown; query: (args?: unknown) => Promise<unknown> }) {
          const nextArgs =
            args === undefined
              ? undefined
              : (transformTokenFields(args, encryptTokenValue) as typeof args);

          const result = await query(nextArgs);
          return transformTokenFields(result, decryptTokenValue);
        },
      },
    },
  } as any);

  return prisma as unknown as PrismaClient;
}

// In production we always create a fresh client bound to the module.
// In development we reuse the instance stored on `globalThis` so that
// hot-module replacement doesn't exhaust the DB connection pool.
export const db: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
