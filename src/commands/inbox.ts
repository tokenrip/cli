import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatInbox } from '../formatters.js';
import { loadState, saveState } from '../state.js';

export async function inbox(options: {
  since?: string;
  types?: string;
  limit?: string;
  human?: boolean;
}): Promise<void> {
  const { client } = requireAuthClient();
  const state = loadState();

  // Determine "since" value: explicit flag > stored cursor > 24h ago
  const sinceOverride = options.since;
  const since = sinceOverride
    ?? state.lastInboxPoll
    ?? new Date(Date.now() - 86400000).toISOString();

  const params: Record<string, string> = { since };
  if (options.types) params.types = options.types;
  if (options.limit) params.limit = options.limit;

  try {
    const { data } = await client.get('/v0/inbox', { params });
    const result = data.data;

    if (!sinceOverride) {
      saveState({ ...state, lastInboxPoll: new Date().toISOString() });
    }

    outputSuccess(result, formatInbox);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('INBOX_FAILED', 'Failed to fetch inbox. Is the server running?');
  }
}
