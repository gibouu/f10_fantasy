import { PrismaClient } from "@prisma/client";
import {
  decryptTokenValue,
  encryptTokenValue,
} from "@/lib/security/account-token-crypto";

// Extend the global type to hold the cached client in dev.
// This prevents multiple PrismaClient instances from being created
// during Next.js hot-reload in development.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const TOKEN_FIELDS = new Set(["access_token", "refresh_token", "id_token"]);

function transformTokenFields(
  value: unknown,
  transform: (token: string) => string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => transformTokenFields(entry, transform));
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const nextRecord: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (TOKEN_FIELDS.has(key)) {
      if (typeof raw === "string") {
        nextRecord[key] = transform(raw);
        continue;
      }

      if (
        raw &&
        typeof raw === "object" &&
        "set" in raw &&
        typeof (raw as { set?: unknown }).set === "string"
      ) {
        nextRecord[key] = {
          ...(raw as Record<string, unknown>),
          set: transform((raw as { set: string }).set),
        };
        continue;
      }
    }

    nextRecord[key] = transformTokenFields(raw, transform);
  }

  return nextRecord;
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
