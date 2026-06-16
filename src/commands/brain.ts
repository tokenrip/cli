import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';

function ref(brain: string): string {
  return encodeURIComponent(brain);
}

// A brain IS a workspace; this CLI is a thin facade over the agent REST
// surface (`/v0/brains/*`). It calls the same BrainService the MCP and
// operator surfaces do — it never imports backend code.

export async function brainCreate(
  slug: string,
  options: { name?: string; description?: string; team?: string; instructions?: string; writePolicy?: string } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/brains', {
    slug,
    name: options.name ?? slug,
    description: options.description,
    team: options.team,
    instructions: options.instructions,
    writePolicy: options.writePolicy,
  });
  outputSuccess(data.data);
}

export async function brainLoad(brain: string, _options: Record<string, unknown> = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/brains/${ref(brain)}/load`);
  outputSuccess(data.data);
}

export async function brainSearch(
  brain: string,
  query: string,
  options: { mode?: string; includeSuperseded?: boolean; expand?: string } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  const params = new URLSearchParams({ q: query });
  if (options.mode) params.set('mode', options.mode);
  if (options.includeSuperseded) params.set('include_superseded', 'true');
  if (options.expand) params.set('expand', options.expand);
  const { data } = await client.get(`/v0/brains/${ref(brain)}/search?${params}`);
  outputSuccess(data.data);
}

export async function brainCapture(
  brain: string,
  options: { title?: string; content?: string; zone?: string; type?: string; supersedes?: string; mode?: string } = {},
): Promise<void> {
  if (!options.content) {
    throw new CliError('MISSING_OPTION', '--content <text> is required');
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/brains/${ref(brain)}/capture`, {
    title: options.title,
    content: options.content,
    zone: options.zone,
    type: options.type,
    supersedes: options.supersedes,
    mode: options.mode,
  });
  outputSuccess(data.data);
}

export async function brainInbox(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/brains/${ref(brain)}/inbox`);
  outputSuccess(data.data);
}

export async function brainInboxResolve(
  brain: string,
  item: string,
  action: string,
  options: { zone?: string; maturity?: string; target?: string } = {},
): Promise<void> {
  if (!['accept', 'reject', 'merge'].includes(action)) {
    throw new CliError('INVALID_ARG', 'action must be accept, reject, or merge');
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/brains/${ref(brain)}/inbox/resolve`, {
    item,
    action,
    zone: options.zone,
    maturity: options.maturity,
    target: options.target,
  });
  outputSuccess(data.data);
}
