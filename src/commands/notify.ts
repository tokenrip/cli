import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatMailbox, formatNoticeSettings } from '../formatters.js';

/**
 * `rip notify …` — who hears about workspace work by email: this agent's notification settings
 * (the default) or its person's (`--for-person`), the person's digest hour, and this agent's own
 * mailbox. Rides agent REST (`GET/PATCH /v0/notifications`, `POST /v0/notifications/mailbox`);
 * mirrors: the dashboard's Settings and Agents pages, MCP `notification_settings_get`,
 * `notification_settings_set` and `notification_mailbox`. Settings are not workspace content, so
 * none of these takes `--why`.
 */

/** `rip notify [--workspace-id <id>] [--for-person]` */
export async function notifyShow(options: { workspaceId?: string; forPerson?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (options.workspaceId !== undefined) params.workspaceId = options.workspaceId;
  if (options.forPerson) params.for = 'person';
  const { data } = await client.get('/v0/notifications', { params });
  outputSuccess(data.data, formatNoticeSettings);
}

/**
 * `rip notify set <workspace-id> <type> <off|soon|digest> [--for-person]` changes one type in one
 * workspace; `rip notify set --tell-person <on|off>` turns this agent's switch (whether work waiting
 * on it goes to its person while it has no confirmed mailbox). The server checks the values.
 */
export async function notifySet(
  workspaceId: string | undefined,
  type: string | undefined,
  delivery: string | undefined,
  options: { forPerson?: boolean; tellPerson?: string },
): Promise<void> {
  const named = [workspaceId, type, delivery].filter((value) => value !== undefined).length;
  if (named !== 0 && named !== 3) {
    throw new CliError('INVALID_ARGUMENT', 'Give the workspace id, the type and the delivery together: rip notify set <workspace-id> <type> <off|soon|digest>.');
  }
  if (named === 0 && options.tellPerson === undefined) {
    throw new CliError('INVALID_ARGUMENT', 'Nothing to change. Give <workspace-id> <type> <off|soon|digest>, or --tell-person <on|off>.');
  }
  if (options.forPerson && options.tellPerson !== undefined) {
    throw new CliError('INVALID_ARGUMENT', "--tell-person is this agent's own switch; leave out --for-person.");
  }
  const body: Record<string, unknown> = {};
  if (options.forPerson) body.for = 'person';
  if (named === 3) Object.assign(body, { workspaceId, type, delivery });
  if (options.tellPerson !== undefined) body.tellPerson = parseOnOff(options.tellPerson);
  const { client } = requireAuthClient();
  const { data } = await client.patch('/v0/notifications', body);
  outputSuccess(data.data, formatNoticeSettings);
}

/** `rip notify digest <hour> [--tz <zone>]` — the person's digest hour (0–23) and IANA time zone. */
export async function notifyDigest(hour: string, options: { tz?: string }): Promise<void> {
  if (!/^\d{1,2}$/.test(hour)) {
    throw new CliError('INVALID_ARGUMENT', 'The digest hour is a whole hour from 0 to 23, such as 8 or 18.');
  }
  const body: Record<string, unknown> = { for: 'person', digestHour: Number(hour) };
  if (options.tz !== undefined) body.timeZone = options.tz;
  const { client } = requireAuthClient();
  const { data } = await client.patch('/v0/notifications', body);
  outputSuccess(data.data, formatNoticeSettings);
}

/**
 * `rip notify mailbox <address> | --code <code> | --remove` — set this agent's mailbox (Tokenrip
 * emails it a six-digit code), confirm it with that code, or clear it.
 */
export async function notifyMailbox(address: string | undefined, options: { code?: string; remove?: boolean }): Promise<void> {
  const given = [address !== undefined, options.code !== undefined, options.remove === true].filter(Boolean).length;
  if (given !== 1) {
    throw new CliError('INVALID_ARGUMENT', 'Give exactly one: an address (rip notify mailbox <address>), --code <code>, or --remove.');
  }
  let body: Record<string, unknown>;
  if (address !== undefined) body = { address };
  else if (options.code !== undefined) body = { code: options.code };
  else body = { remove: true };
  const { client } = requireAuthClient();
  try {
    const { data } = await client.post('/v0/notifications/mailbox', body);
    outputSuccess(data.data, formatMailbox);
  } catch (err) {
    // The general hints point at sign-in or `rip operator-link`; the person can simply set it.
    if (err instanceof CliError && MAILBOX_OPERATOR_REFUSALS.has(err.code)) err.hint = MAILBOX_OPERATOR_HINT;
    throw err;
  }
}

/** Refusals of a mailbox code for want of exactly one verified person behind the agent. */
const MAILBOX_OPERATOR_REFUSALS = new Set(['NO_OPERATOR', 'OPERATOR_AMBIGUOUS']);

function parseOnOff(value: string): boolean {
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new CliError('INVALID_ARGUMENT', '--tell-person takes on or off.');
}

/** A mailbox code refused for want of exactly one verified person: the person can set the mailbox instead. */
export const MAILBOX_OPERATOR_HINT = "Ask your person to set this agent's mailbox from the dashboard's Agents page.";
