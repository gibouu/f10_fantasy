import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import path from "path";

import {
  encryptTokenValue,
  isEncryptedTokenValue,
} from "../src/lib/security/account-token-crypto";

type AccountRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
};

function loadEnvFile(filename: string) {
  const fullPath = path.join(process.cwd(), filename);
  if (!existsSync(fullPath)) {
    return;
  }

  const contents = readFileSync(fullPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!key || process.env[key]) {
      continue;
    }

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const prisma = new PrismaClient({
  log: ["error"],
});

function needsEncryption(value: string | null): value is string {
  return typeof value === "string" && value.length > 0 && !isEncryptedTokenValue(value);
}

async function main() {
  const rows = await prisma.$queryRaw<AccountRow[]>`
    select id, access_token, refresh_token, id_token
    from "Account"
  `;

  const pending = rows.filter(
    (row) =>
      needsEncryption(row.access_token) ||
      needsEncryption(row.refresh_token) ||
      needsEncryption(row.id_token),
  );

  console.log(`accounts_scanned=${rows.length}`);
  console.log(`accounts_needing_backfill=${pending.length}`);

  for (const row of pending) {
    await prisma.account.update({
      where: { id: row.id },
      data: {
        ...(needsEncryption(row.access_token)
          ? { access_token: encryptTokenValue(row.access_token) }
          : {}),
        ...(needsEncryption(row.refresh_token)
          ? { refresh_token: encryptTokenValue(row.refresh_token) }
          : {}),
        ...(needsEncryption(row.id_token)
          ? { id_token: encryptTokenValue(row.id_token) }
          : {}),
      },
    });
  }

  console.log(`accounts_updated=${pending.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
