import { randomBytes, createHash } from 'crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/**
 * Generate a PKCE verifier + challenge pair (S256).
 * Verifier: 32 random bytes, base64url-encoded.
 * Challenge: SHA-256(verifier), base64url-encoded.
 */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}
