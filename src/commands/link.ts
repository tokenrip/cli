import { CliError } from '../errors.js';
import { signInPointer } from './auth.js';

/**
 * `rip auth link` — retired: agents sign in by email instead of downloading a keypair (the server
 * answers 410). Makes no request. Delete with the route 60 days after launch.
 */
export async function link(_options?: unknown): Promise<void> {
  throw new CliError('RETIRED', `rip auth link is retired. ${signInPointer()}`);
}
