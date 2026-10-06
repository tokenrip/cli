import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getConfigDir } from './config.js';

/**
 * Which skill version a local folder was fetched at (`rip skill get --dir`) or last published as,
 * so `rip skill publish <folder>` diffs against that version and sends it as `expectedVersion`:
 * a teammate's publish in between is then a CONFLICT instead of being silently reverted.
 * Kept in the CLI config dir, never in the folder (publish refuses hidden files).
 */
export interface SkillCheckout {
  skillId: string;
  version: number;
  /** The API the version came from; a checkout from another server does not apply. */
  apiUrl: string;
}

/** Folder realpath → checkout. */
export type SkillCheckouts = Record<string, SkillCheckout>;

function checkoutsFile(): string {
  return path.join(getConfigDir(), 'skill-checkouts.json');
}

export function loadSkillCheckouts(): SkillCheckouts {
  try {
    const parsed = JSON.parse(fs.readFileSync(checkoutsFile(), 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SkillCheckouts) : {};
  } catch {
    return {};
  }
}

/** The checkout recorded for `folder` against `apiUrl`, if any. */
export function findSkillCheckout(folder: string, apiUrl: string): SkillCheckout | null {
  const checkout = loadSkillCheckouts()[fs.realpathSync(folder)];
  return checkout && checkout.apiUrl === apiUrl && Number.isSafeInteger(checkout.version) ? checkout : null;
}

/**
 * Record `folder`'s checkout, dropping entries whose folder no longer exists. Written to a
 * temporary file (mode 0600) and renamed over the old one, so a reader never sees half a file.
 */
export function recordSkillCheckout(folder: string, checkout: SkillCheckout): void {
  const all = loadSkillCheckouts();
  for (const key of Object.keys(all)) if (!fs.existsSync(key)) delete all[key];
  all[fs.realpathSync(folder)] = checkout;
  const file = checkoutsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(all, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}
