import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatMessageSent, formatMessages } from '../formatters.js';
import { resolveRecipient } from '../contacts.js';

export async function msgSend(
  body: string,
  options: {
    to?: string;
    thread?: string;
    intent?: string;
    type?: string;
    data?: string;
    inReplyTo?: string;
  },
): Promise<void> {
  if (!options.to && !options.thread) {
    throw new CliError('MISSING_OPTION', 'Provide --to <recipient> or --thread <id>');
  }
  if (options.to && options.thread) {
    throw new CliError('CONFLICTING_OPTIONS', 'Use --to or --thread, not both');
  }

  const { client } = requireAuthClient();

  const payload: Record<string, unknown> = { body };
  if (options.intent) payload.intent = options.intent;
  if (options.type) payload.type = options.type;
  if (options.data) payload.data = JSON.parse(options.data);

  let endpoint: string;
  if (options.to) {
    payload.to = [resolveRecipient(options.to)];
    endpoint = '/v0/messages';
  } else {
    if (options.inReplyTo) payload.in_reply_to = options.inReplyTo;
    endpoint = `/v0/threads/${options.thread}/messages`;
  }

  const { data } = await client.post(endpoint, payload);
  outputSuccess(data.data, formatMessageSent);
}

export async function msgList(options: {
  thread: string;
  since?: string;
  limit?: string;
}): Promise<void> {
  if (!options.thread) {
    throw new CliError('MISSING_OPTION', '--thread <id> is required');
  }

  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (options.since) params.since_sequence = options.since;
  if (options.limit) params.limit = options.limit;

  const { data } = await client.get(`/v0/threads/${options.thread}/messages`, { params });
  outputSuccess(data.data as unknown as Record<string, unknown>, formatMessages);
}
