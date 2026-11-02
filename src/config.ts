import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getConfigDir(): string {
  return process.env.TOKENRIP_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'tokenrip');
}

export const CONFIG_DIR = process.env.TOKENRIP_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'tokenrip');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface TokenripConfig {
  configVersion?: number;
  currentAccount?: string;
  /** @deprecated use currentAccount */
  currentAgent?: string;
  apiKey?: string;
  apiUrl?: string;
  frontendUrl?: string;
  lastUpdateCheck?: string;
  latestVersion?: string;
  preferences: Record<string, unknown>;
}

/** The config schema version this CLI writes; `migrations.ts` upgrades older files to it. */
export const CURRENT_CONFIG_VERSION = 3;

/** A fresh install starts at the current version: nothing to migrate, nothing to warn about. */
function defaultConfig(): TokenripConfig {
  return { configVersion: CURRENT_CONFIG_VERSION, preferences: {} };
}

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Take group and other access off an existing path, since a write's `mode` applies only on create.
 * Best effort and silent: a filesystem that refuses chmod must not stop a command, and stdout may
 * be `--json`.
 */
export function tightenMode(target: string): void {
  if (process.platform === 'win32') return;
  try {
    const { mode } = fs.statSync(target);
    if (mode & 0o077) fs.chmodSync(target, mode & 0o700);
  } catch {
    // Missing, or refused.
  }
}

export function loadConfig(): TokenripConfig {
  const file = path.join(getConfigDir(), 'config.json');
  tightenMode(file);
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as TokenripConfig;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: TokenripConfig): void {
  const dir = getConfigDir();
  const file = path.join(dir, 'config.json');
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  // A directory named by TOKENRIP_CONFIG_DIR is the person's to set: it may be shared, and the
  // files in it are private either way.
  if (!process.env.TOKENRIP_CONFIG_DIR) tightenMode(dir);
  // Before the write: an existing 0644 file must not hold the new contents for a moment.
  tightenMode(file);
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: PRIVATE_FILE_MODE });
}

export function getApiUrl(config: TokenripConfig): string {
  return process.env.TOKENRIP_API_URL || config.apiUrl || 'https://api.tokenrip.com';
}

export function getApiKey(config: TokenripConfig): string | undefined {
  return process.env.TOKENRIP_API_KEY || config.apiKey;
}

function deriveFrontendUrl(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    if (parsed.hostname === 'api.tokenrip.com') {
      return 'https://tokenrip.com';
    }
    if (parsed.hostname.startsWith('api.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    return parsed.origin;
  } catch {
    return 'https://tokenrip.com';
  }
}

export function getFrontendUrl(config?: TokenripConfig): string {
  const resolved = config ?? loadConfig();
  return process.env.TOKENRIP_FRONTEND_URL || resolved.frontendUrl || deriveFrontendUrl(getApiUrl(resolved));
}
