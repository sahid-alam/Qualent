import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// SECRET_KEY: 32 random bytes, base64. Generate with `openssl rand -base64 32`.
function key() {
  const value = Buffer.from(process.env.SECRET_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("SECRET_KEY must be 32 bytes, base64 encoded");
  return value;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, body] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
