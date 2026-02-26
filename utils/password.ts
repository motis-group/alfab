import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SCRYPT_KEY_LEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function toHex(input: Buffer): string {
  return input.toString('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derived)}`;
}

function parseScryptHash(input: string): {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  digest: Buffer;
} | null {
  const parts = input.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return null;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[4], 'hex');
    const digest = Buffer.from(parts[5], 'hex');
    if (!salt.length || !digest.length) {
      return null;
    }

    return {
      n,
      r,
      p,
      salt,
      digest,
    };
  } catch {
    return null;
  }
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parsed = parseScryptHash(storedHash);
  if (!parsed) {
    return storedHash === password;
  }

  const derived = scryptSync(password, parsed.salt, parsed.digest.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });

  if (derived.length !== parsed.digest.length) {
    return false;
  }

  return timingSafeEqual(derived, parsed.digest);
}
