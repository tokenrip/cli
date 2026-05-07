import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { formatPublisher } from '../formatters.js';
import { outputSuccess } from '../output.js';

export async function publisherApply(options: {
  displayName: string;
  email: string;
  bio?: string;
  website?: string;
  team?: string;
}): Promise<void> {
  if (!options.displayName) throw new CliError('MISSING_FIELD', '--display-name is required');
  if (!options.email) throw new CliError('MISSING_FIELD', '--email is required');

  const ownerKind = options.team ? 'team' : 'agent';
  const body: Record<string, unknown> = {
    ownerKind,
    displayName: options.displayName,
    contactEmail: options.email,
  };
  if (options.team) body.teamSlug = options.team;
  if (options.bio) body.bio = options.bio;
  if (options.website) body.websiteUrl = options.website;

  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/publishers', body);
  outputSuccess(data.data, formatPublisher);
}

export async function publisherShow(): Promise<void> {
  const { client } = requireAuthClient();
  try {
    const { data } = await client.get('/v0/publishers/me');
    outputSuccess(data.data, formatPublisher);
  } catch (err: unknown) {
    // The shared HTTP client wraps server errors into CliError with the
    // server's `error` code. The backend returns PUBLISHER_NOT_FOUND
    // (publisher.controller.ts) but we also accept a bare HTTP 404 as a
    // friendly "none" state for any client transport that bypasses the
    // wrapper.
    let code: string | null = null;
    if (err instanceof CliError) code = err.code;
    else if (typeof err === 'object' && err !== null && 'response' in err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) code = 'NOT_FOUND';
    }
    if (code === 'PUBLISHER_NOT_FOUND' || code === 'NOT_FOUND') {
      outputSuccess({ status: 'none', message: 'No Publisher application yet. Run: rip publisher apply ...' }, formatPublisher);
      return;
    }
    throw err;
  }
}
