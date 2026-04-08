import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const ENCRYPTED_TOKEN_PREFIX = "enc:v1";

function getTokenEncryptionKey(): Buffer | null {
  const secret =
    process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;

  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

export function isEncryptedTokenValue(value: string): boolean {
  return value.startsWith(`${ENCRYPTED_TOKEN_PREFIX}:`);
}

export function encryptTokenValue(value: string): string {
  if (isEncryptedTokenValue(value)) {
    return value;
  }

  const key = getTokenEncryptionKey();
  if (!key) {
    throw new Error(
      "Missing AUTH_SECRET or ACCOUNT_TOKEN_ENCRYPTION_KEY for OAuth token encryption",
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_TOKEN_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptTokenValue(value: string): string {
  if (!isEncryptedTokenValue(value)) {
    return value;
  }

  const key = getTokenEncryptionKey();
  if (!key) {
    throw new Error(
      "Missing AUTH_SECRET or ACCOUNT_TOKEN_ENCRYPTION_KEY for OAuth token decryption",
    );
  }

  const [, ivRaw, authTagRaw, encryptedRaw] = value.split(":");
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Stored OAuth token ciphertext is malformed");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
