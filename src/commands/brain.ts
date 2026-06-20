import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import {
  formatBrain,
  formatBrainList,
  formatBrainInstructions,
  formatBrainSearch,
  formatBrainLoad,
  formatBrainCapture,
  formatBrainInbox,
  formatBrainInboxResolve,
  formatBrainSources,
  formatBrainSource,
  formatBrainMembers,
  formatBrainMember,
  formatBrainLifecycle,
} from '../formatters.js';

function ref(brain: string): string {
  return encodeURIComponent(brain);
}

// A brain IS a workspace; this CLI is a thin facade over the agent REST
// surface. Knowledge + management verbs hit `/v0/brains/*`; sources/members/
// lifecycle reuse the existing `/v0/workspaces/*` routes (a brain is a
// workspace by slug). Every command passes a formatter so human mode renders
// readable text — `--json` still emits the raw envelope.

export async function brainCreate(
  slug: string,
  options: { name?: string; description?: string; team?: string; instructions?: string; writePolicy?: string; atomizePlaybook?: string; consolidatePlaybook?: string; visibility?: string } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/brains', {
    slug,
    name: options.name ?? slug,
    description: options.description,
    team: options.team,
    instructions: options.instructions,
    writePolicy: options.writePolicy,
    atomizePlaybook: options.atomizePlaybook,
    consolidatePlaybook: options.consolidatePlaybook,
    visibility: options.visibility,
  });
  outputSuccess(data.data, formatBrain);
}

export async function brainList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/brains');
  outputSuccess(data.data, formatBrainList);
}

export async function brainShow(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/brains/${ref(brain)}`);
  outputSuccess(data.data, formatBrain);
}

export async function brainVisibility(slug: string, level: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/workspaces/${slug}`, { visibility: level });
  outputSuccess(data.data, formatBrain);
}

export async function brainInstructionsGet(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/brains/${ref(brain)}/instructions`);
  outputSuccess(data.data, formatBrainInstructions);
}

export async function brainInstructionsSet(
  brain: string,
  text: string | undefined,
  options: { artifact?: string } = {},
): Promise<void> {
  if (!text && !options.artifact) {
    throw new CliError('MISSING_OPTION', 'Provide instruction text or --artifact <alias>');
  }
  if (text && options.artifact) {
    throw new CliError('INVALID_ARG', 'Provide either text OR --artifact, not both');
  }
  const { client } = requireAuthClient();
  const { data } = await client.put(`/v0/brains/${ref(brain)}/instructions`, options.artifact ? { artifact: options.artifact } : { text });
  outputSuccess(data.data, formatBrain);
}

export async function brainPlaybookSet(brain: string, command: string, options: { artifact?: string } = {}): Promise<void> {
  if (!['atomize', 'consolidate'].includes(command)) {
    throw new CliError('INVALID_ARG', 'command must be atomize or consolidate');
  }
  if (!options.artifact) {
    throw new CliError('MISSING_OPTION', '--artifact <alias> is required');
  }
  const { client } = requireAuthClient();
  const { data } = await client.put(`/v0/brains/${ref(brain)}/playbook/${command}`, { artifact: options.artifact });
  outputSuccess(data.data, formatBrain);
}

export async function brainLoad(brain: string, options: { command?: string } = {}): Promise<void> {
  const { client } = requireAuthClient();
  const qs = options.command ? `?command=${encodeURIComponent(options.command)}` : '';
  const { data } = await client.get(`/v0/brains/${ref(brain)}/load${qs}`);
  outputSuccess(data.data, formatBrainLoad);
}

/** `rip brain consolidate <brain>` — load the consolidate playbook as flow. */
export function brainConsolidate(brain: string): Promise<void> {
  return brainLoad(brain, { command: 'consolidate' });
}

/** `rip brain atomize <brain>` — load the atomize playbook as flow. */
export function brainAtomize(brain: string): Promise<void> {
  return brainLoad(brain, { command: 'atomize' });
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
  outputSuccess(data.data, formatBrainSearch);
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
  outputSuccess(data.data, formatBrainCapture);
}

export async function brainInbox(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/brains/${ref(brain)}/inbox`);
  outputSuccess(data.data, formatBrainInbox);
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
  outputSuccess(data.data, formatBrainInboxResolve);
}

// ── sources / members / lifecycle (reuse the /v0/workspaces routes) ──

export async function brainSourceAdd(
  brain: string,
  item: string,
  options: { kind?: string; ownership?: string } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${brain}/items`, {
    kind: options.kind ?? 'artifact',
    item,
    ownership: options.ownership ?? 'linked',
  });
  outputSuccess(data.data, formatBrainSource);
}

export async function brainSourceList(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${brain}/items`);
  outputSuccess(data.data, formatBrainSources);
}

export async function brainSourceRemove(brain: string, item: string, options: { kind?: string } = {}): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${brain}/items/${options.kind ?? 'artifact'}/${encodeURIComponent(item)}`);
  outputSuccess({ removed: item }, formatBrainSource);
}

export async function brainMemberAdd(brain: string, account: string, options: { role?: string } = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${brain}/members`, { account, role: options.role });
  outputSuccess(data.data, formatBrainMember);
}

export async function brainMemberList(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${brain}/members`);
  outputSuccess(data.data, formatBrainMembers);
}

export async function brainMemberRemove(brain: string, account: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${brain}/members/${encodeURIComponent(account)}`);
  outputSuccess({ removed: account }, formatBrainMember);
}

export async function brainArchive(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${brain}/archive`);
  outputSuccess(data.data, formatBrainLifecycle);
}

export async function brainDelete(brain: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${brain}`);
  outputSuccess({ deleted: brain }, formatBrainLifecycle);
}
