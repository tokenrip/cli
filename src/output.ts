import { CliError, toCliError } from './errors.js';
import { principalWho, taskHolderLine, type Formatter } from './formatters.js';

let forceJson = false;
let configHuman = false;

export function setForceJson(value: boolean): void {
  forceJson = value;
}

export function setConfigHuman(value: boolean): void {
  configHuman = value;
}

function isJsonMode(): boolean {
  if (forceJson) return true;
  if (process.env.TOKENRIP_OUTPUT === 'json') return true;
  if (process.env.TOKENRIP_OUTPUT === 'human') return false;
  if (configHuman) return false;
  return false;
}

export function outputSuccess(data: Record<string, unknown>, formatter?: Formatter): void {
  if (isJsonMode() || !formatter) {
    console.log(JSON.stringify({ ok: true, data }));
  } else {
    console.log(formatter(data));
  }
}

export function outputError(err: CliError): never {
  if (isJsonMode()) {
    console.log(JSON.stringify({
      ok: false, error: err.code, message: err.message,
      ...(err.details ? { details: err.details } : {}),
      ...(err.partial ? { partial: err.partial } : {}),
    }));
  } else {
    console.error(`Error [${err.code}]: ${err.message}`);
    const details = err.details;
    if (details && !Array.isArray(details) && ('elapsedMs' in details || 'timeoutMs' in details || 'transportCode' in details || 'responseReceived' in details)) {
      if (details.elapsedMs !== undefined) console.error(`Elapsed: ${Math.round(details.elapsedMs)} ms`);
      if (details.timeoutMs !== undefined) console.error(`Configured timeout: ${details.timeoutMs} ms`);
      if (details.transportCode) console.error(`Transport code: ${details.transportCode}`);
      if (details.responseReceived !== undefined) console.error(`HTTP response received: ${details.responseReceived ? 'yes' : 'no'}`);
      if (details.httpStatus !== undefined) console.error(`HTTP status: ${details.httpStatus}`);
    } else if (details && !Array.isArray(details)) {
      if (details.currentVersionId) console.error(`Current version: ${details.currentVersionId}`);
      if (details.currentRevision) console.error(`Current revision: ${details.currentRevision}`);
      if (details.currentWorkspaceRevision) console.error(`Current workspace revision: ${details.currentWorkspaceRevision}`);
      if (err.code === 'CONFLICT') console.error('Read the current resource and reconcile your changes before another write.');
      if (err.code === 'PRECONDITION_REQUIRED' && details.field) console.error(`Required field: ${details.field}. Read the current resource to obtain its value, then correct the request.`);
      if (err.code === 'INVALID_SCOPE' && details.field) console.error(`Required field: ${details.field}. Supply the workspace identity or omit workspace-only fields.`);
      if (details.fields?.length) console.error(`Omit incompatible fields: ${details.fields.join(', ')}. ${err.code === 'INELIGIBLE_STORAGE' ? 'Workspace content cannot use independently public storage.' : 'Use workspace audience to share content.'}`);
      if (details.reason) console.error(`Reason: ${details.reason}`);
      if (details.holder) console.error(`Held by: ${taskHolderLine(details.holder)}`);
      if (details.reviewer !== undefined) console.error(`Reviewer: ${details.reviewer ? principalWho(details.reviewer) : 'any person who can edit tasks'}`);
      if (details.status) console.error(`Status: ${details.status}`);
      if (details.decision) {
        const by = details.decision.byInstructions
          ? `on its own (instructions v${details.decision.byInstructions.version})`
          : `by ${details.decision.by ? principalWho(details.decision.by) : 'someone no longer named'}`;
        console.error(`Decided: ${details.decision.outcome} ${by} at ${details.decision.at}`);
      }
      if (details.used !== undefined && details.limit !== undefined) console.error(`Workspaces: ${details.used} of ${details.limit}${details.plan ? ` (${details.plan})` : ''}`);
      if (details.billingUrl) console.error(`Billing: ${details.billingUrl}`);
    }
  }

  // Always write actionable hints to stderr when interactive
  if (process.stderr.isTTY) {
    const hint = err.hint ?? ERROR_HINTS[err.code];
    if (hint) console.error(`Hint: ${hint}`);
  }

  process.exit(1);
}

export function wrapCommand<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  const wrapped = async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      outputError(toCliError(err));
    }
  };
  return wrapped as unknown as T;
}

export const ERROR_HINTS: Record<string, string> = {
  NO_API_KEY: 'Sign in with your email: `rip auth login --email <your email>`.',
  UNAUTHORIZED: 'A key stops working when it is revoked (`rip auth keys revoke`, the dashboard) or replaced by a newer sign-in on this machine.',
  NO_IDENTITY: 'Sign in with your email: `rip auth login --email <your email>`.',
  IDENTITY_NOT_FOUND: 'Run `rip account list` to see available agents.',
  AMBIGUOUS_IDENTITY: 'Use `rip account use <name>` to select an agent, or pass `--agent <name>`.',
  LAST_IDENTITY: 'Sign in to another account first with `rip auth login --email <your email>`.',
  NETWORK_ERROR: 'Check your connection. Run `rip config show` to verify the API URL.',
  TIMEOUT: 'Inspect the operation outcome before repeating a write; the server may have committed it.',
  FILE_NOT_FOUND: 'Check the file path and try again.',
  INVALID_TYPE: 'Valid types depend on the command; for artifacts they include markdown, html, chart, code, text, json, csv, and table.',
  INVALID_JSON: 'Check quoting and make sure the value is valid JSON.',
  INVALID_DURATION: 'Use formats like 30m, 1h, or 7d.',
  INVALID_REF: 'Use a full URL or an artifact UUID.',
  AUTH_FAILED: 'Could not create API key. Is the server running?',
  INVALID_CODE: 'Codes last 10 minutes and work once. Request a new one: `rip auth login --email <your email>`, or ask a connected agent to run `rip auth code`.',
  CODE_RECENTLY_SENT: 'A code was sent less than a minute ago. Check the inbox (and the spam folder) before asking again.',
  SIGN_IN_LOCKED: 'Too many wrong codes for this email. Wait until the time in the message, then request a new code.',
  NO_LOCAL_KEYPAIR: 'Email sign-in needs no keypair. To use this account elsewhere, sign in there or hand off with `rip auth code`.',
  RUN_KEY_EXPIRED: 'Get a new code from your key sign-in page and sign in again.',
  RUN_KEY_FORBIDDEN: 'Run keys cannot manage keys; ask the person to use the Agents page.',
  NO_OPERATOR: 'This account is not linked to a verified person. Sign in by email instead (`rip auth login --email <your email>`), or link this agent with `rip operator-link`.',
  INVALID_AGENT_ID: 'Agent IDs start with rip1. Example: rip1x9a2f...',
  INVALID_OUTPUT_FORMAT: 'Valid values are "json" and "human".',
  DELETED: 'The item is in the trash. If you deleted it (or may delete it), bring it back with `rip trash restore <type> <id>`; `rip trash list` shows the entry.',
  WORKSPACE_DELETED: 'The workspace is in the trash. A workspace admin can bring it back, with everything in it, using `rip trash restore workspace <id>`.',
  WHY_REQUIRED: 'Add --why "<what the person is trying to accomplish>" or set TOKENRIP_WHY. If your rip has no --why flag, run `rip self-update`.',
  SESSION_END_RETIRED: 'Sessions record themselves. Leave a note with `rip artifact publish <file> --type markdown --workspace-id <id> --handoff --why "…"`.',
  TASK_IN_REVIEW: 'The task waits for a decision: nothing starts, stops or completes it, and its assignee and reviewer stay as they are. If it is your proposal, stop here: once approved, `rip workspace load` lists it under Waiting on you, and a skip cancels it. If it is someone else\'s, leave it to its reviewer. Its proposer, the proposer\'s person or whoever decides it may withdraw it with `rip task cancel <id>`.',
  TASK_NOT_IN_REVIEW: 'There is nothing to decide: it was decided already (Decided above) or was never proposed. `rip task show <id>` shows where it stands.',
  REVIEW_NOT_YOURS: 'Decide only reviews addressed to you: `rip task list --workspace-id <ws> --reviewer me`. A person decides theirs in the dashboard; never decide your own proposal.',
  INVALID_REVIEWER: 'Omit --reviewer to ask your own person, or name a member who can edit tasks in its audience: a person, or agent:<handle> from `rip workspace load`. Never yourself, the assignee, or a reviewer other than the one the task already names.',
  TOO_MANY_PROPOSALS: 'You have 200 proposals In review in this workspace. Wait for decisions, or withdraw some with `rip task cancel <id>`, before proposing more.',
  TASK_NOT_DONE: 'A later result goes on a Done task. To finish this one, `rip task done <id> --result-text "…"`.',
  WORKSPACE_BUSY: 'Wait a moment and run it again; nothing was changed.',
  WORKSPACE_LIMIT_REACHED: 'A team-owned workspace needs the Team plan: give your person the Billing link to subscribe. Otherwise the owner is at its maximum: delete a workspace to make room.',
  TEAM_HAS_PLAN: "Cancel the team's plan in Billing first.",
  STORAGE_LIMIT_REACHED: 'Nothing was stored. Tell your person, and do not delete anything on your own. Whoever pays (your account, your team, or the workspace\'s owner) can free space (`rip storage` shows what your account or team holds; deleted files count until their trash is emptied, `rip trash purge --all`, with `--team <slug>` for a team\'s or `--workspace <id>` for files deleted inside a workspace; `rip artifact prune-versions <id>` clears old versions), move growing records into a table, or add storage in Billing (the link above, when your account or team pays).',
  MAILBOX_CODE_INVALID: 'Use the six-digit code from the latest confirmation email: `rip notify mailbox --code <code>`. Five wrong codes end it; then set the address again.',
  MAILBOX_CODE_EXPIRED: 'The code lasted 30 minutes or five tries. Set the address again for a new one: `rip notify mailbox <address>`.',
  MAILBOX_NOT_PENDING: 'No code is waiting. Set the address first (`rip notify mailbox <address>`), then confirm with the emailed code; `rip notify` shows the mailbox.',
  DUPLICATE_UNIQUE_VALUE: 'Nothing was written: the table\'s key column already holds this value, or the call repeats it. Change or remove the repeated value; to update a stored row instead, append with `--upsert-on <key column>`.',
};
