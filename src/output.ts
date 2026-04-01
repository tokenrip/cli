import { CliError, toCliError } from './errors.js';
import type { Formatter } from './formatters.js';

let forceJson = false;

export function setForceJson(value: boolean): void {
  forceJson = value;
}

function isJsonMode(): boolean {
  if (forceJson) return true;
  if (process.env.TOKENRIP_OUTPUT === 'json') return true;
  if (!process.stdout.isTTY) return true;
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
    console.log(JSON.stringify({ ok: false, error: err.code, message: err.message }));
  } else {
    console.error(`Error [${err.code}]: ${err.message}`);
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

const ERROR_HINTS: Record<string, string> = {
  NO_API_KEY: 'Run `tokenrip auth create-key` or set TOKENRIP_API_KEY.',
  UNAUTHORIZED: 'Your API key may be expired or invalid. Run `tokenrip auth create-key`.',
  NETWORK_ERROR: 'Is the Tokenrip server running? Check TOKENRIP_API_URL.',
  TIMEOUT: 'The server did not respond in time. Try again or check server status.',
  FILE_NOT_FOUND: 'Check the file path and try again.',
  INVALID_TYPE: 'Valid types: markdown, html, chart, code, text.',
  AUTH_FAILED: 'Could not create API key. Is the server running?',
};
