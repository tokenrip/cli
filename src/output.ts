import { CliError, toCliError } from './errors.js';
import type { Formatter } from './formatters.js';

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
    console.log(JSON.stringify({ ok: false, error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }));
  } else {
    console.error(`Error [${err.code}]: ${err.message}`);
    const details = err.details;
    if (details && !Array.isArray(details)) {
      if (details.currentVersionId) console.error(`Current version: ${details.currentVersionId}`);
      if (details.currentRevision) console.error(`Current revision: ${details.currentRevision}`);
      if (details.currentWorkspaceRevision) console.error(`Current workspace revision: ${details.currentWorkspaceRevision}`);
      if (err.code === 'CONFLICT') console.error('Read the current resource and reconcile your changes before another write.');
      if (err.code === 'PRECONDITION_REQUIRED' && details.field) console.error(`Required field: ${details.field}. Read the current resource to obtain its value, then correct the request.`);
      if (err.code === 'INVALID_SCOPE' && details.field) console.error(`Required field: ${details.field}. Supply the workspace identity or omit workspace-only fields.`);
      if (details.fields?.length) console.error(`Omit incompatible fields: ${details.fields.join(', ')}. ${err.code === 'INELIGIBLE_STORAGE' ? 'Workspace content cannot use independently public storage.' : 'Use workspace audience to share content.'}`);
      if (details.reason) console.error(`Reason: ${details.reason}`);
      if (details.status) console.error(`Session status: ${details.status}. Select another resumable session or explicitly start new participation.`);
    }
  }

  // Always write actionable hints to stderr when interactive
  if (process.stderr.isTTY) {
    const hint = ERROR_HINTS[err.code];
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
  NO_OPERATOR: 'This account is not linked to a verified person. Sign in by email instead (`rip auth login --email <your email>`), or link this agent with `rip operator-link`.',
  INVALID_AGENT_ID: 'Agent IDs start with rip1. Example: rip1x9a2f...',
  INVALID_OUTPUT_FORMAT: 'Valid values are "json" and "human".',
};
