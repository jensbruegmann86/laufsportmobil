import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { z } from "zod";

const TOKEN_VERSION_V1 = 1;
const TOKEN_VERSION_V2 = 2;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const TokenPayloadV1Schema = z.object({
  v: z.literal(TOKEN_VERSION_V1),
  runId: z.uuid(),
  teacherId: z.uuid(),
  exp: z.number().int().positive(),
  nonce: z.string().min(12),
});

const TokenPayloadV2Schema = z.object({
  v: z.literal(TOKEN_VERSION_V2),
  runId: z.uuid(),
  exp: z.number().int().positive(),
  nonce: z.string().min(12),
});

const TokenPayloadSchema = z.union([TokenPayloadV1Schema, TokenPayloadV2Schema]);

const NormalizedTokenPayloadSchema = z.object({
  runId: z.uuid(),
  teacherId: z.uuid().optional(),
  exp: z.number().int().positive(),
  nonce: z.string().min(12),
});

export type TeacherRunAccessTokenPayload = z.infer<typeof NormalizedTokenPayloadSchema>;

function getTokenSecretKey(): Buffer {
  const rawSecret = process.env.TEACHER_RUN_LINK_SECRET;

  if (!rawSecret) {
    throw new Error("Missing TEACHER_RUN_LINK_SECRET environment variable.");
  }

  return createHash("sha256").update(rawSecret).digest();
}

export function createTeacherRunAccessToken(input: {
  runId: string;
  expiresInSeconds?: number;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = TokenPayloadV2Schema.parse({
    v: TOKEN_VERSION_V2,
    runId: input.runId,
    exp: nowSeconds + (input.expiresInSeconds ?? 60 * 60 * 24),
    nonce: randomBytes(12).toString("hex"),
  });

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getTokenSecretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function verifyTeacherRunAccessToken(token: string): TeacherRunAccessTokenPayload {
  let decoded: Buffer;

  try {
    decoded = Buffer.from(token, "base64url");
  } catch {
    throw new Error("Invalid token encoding.");
  }

  if (decoded.byteLength <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid token format.");
  }

  const iv = decoded.subarray(0, IV_LENGTH);
  const authTag = decoded.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = decoded.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", getTokenSecretKey(), iv);
  decipher.setAuthTag(authTag);

  let plaintext: string;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Token decryption failed.");
  }

  let json: unknown;
  try {
    json = JSON.parse(plaintext);
  } catch {
    throw new Error("Invalid token payload.");
  }

  const payload = TokenPayloadSchema.parse(json);

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired.");
  }

  return NormalizedTokenPayloadSchema.parse({
    runId: payload.runId,
    teacherId: "teacherId" in payload ? payload.teacherId : undefined,
    exp: payload.exp,
    nonce: payload.nonce,
  });
}
