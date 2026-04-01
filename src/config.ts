import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'tokenrip');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface TokenripConfig {
  apiKey?: string;
  apiUrl?: string;
  preferences: Record<string, unknown>;
}

function defaultConfig(): TokenripConfig {
  return { preferences: {} };
}

export function loadConfig(): TokenripConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as TokenripConfig;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: TokenripConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getApiUrl(config: TokenripConfig): string {
  return config.apiUrl || process.env.TOKENRIP_API_URL || 'https://api.tokenrip.com';
}

export function getApiKey(config: TokenripConfig): string | undefined {
  return config.apiKey || process.env.TOKENRIP_API_KEY;
}
