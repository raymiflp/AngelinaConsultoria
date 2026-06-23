import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password using bcryptjs with 12 salt rounds.
 *
 * The resulting string starts with "$2a$12$..." and can be verified
 * via {@link verify}.
 */
export async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain-text password against a previously generated bcrypt hash.
 */
export async function verify(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
