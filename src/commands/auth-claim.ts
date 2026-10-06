import { CliError } from '../errors.js';
import { signInPointer } from './auth.js';

/**
 * `rip auth claim` — retired: agents sign in by email or with a code from a connected agent
 * (the server answers 410). Makes no request.
 * Delete with the route 60 days after launch (plan "Deleted later").
 */
export async function authClaim(_code?: string, _options?: unknown): Promise<void> {
  throw new CliError('RETIRED', `rip auth claim is retired. ${signInPointer()}`);
}
