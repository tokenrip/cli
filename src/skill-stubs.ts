import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Stubs for filesystem hosts (`rip skill install`). A stub is a folder in the host's user-level
 * skills folder whose `SKILL.md` carries the skill's name and description, so the host triggers it
 * natively, and whose body tells the agent to load the real skill by id with `rip skill get`. The
 * marker file is the only proof that a folder was written here: a folder without it is never touched.
 */
export const SKILL_STUB_MARKER = '.tokenrip-skill.json';

export const SKILL_TARGETS = ['claude', 'agents'] as const;
export type SkillTarget = (typeof SKILL_TARGETS)[number];

/** What a stub needs from a catalog entry (`GET /v0/skills`). */
export interface StubEntry {
  id: string;
  name: string;
  description: string;
  owner: { kind: 'operator'; alias: string | null } | { kind: 'team'; slug: string; name: string };
}

/**
 * Who installs. `accountId` is the local identity the stubs pin with `--agent` (null when
 * `TOKENRIP_API_KEY` drives auth); `apiUrl` is recorded in the marker.
 */
export interface StubInstaller {
  accountId: string | null;
  apiUrl: string;
}

/** The marker's content. */
export interface StubMarker {
  skillId: string;
  name: string;
  team: string | null;
  accountId: string | null;
  apiUrl: string;
}

export type StubSkipReason = 'unmanaged' | 'name_taken' | 'other_agent' | 'invalid_entry';

export interface StubSyncResult {
  /** New stub folders. */
  written: string[];
  /** Existing stubs whose content changed (description, id, owner, marker). */
  refreshed: string[];
  /** Existing stubs already current. */
  unchanged: string[];
  /** Stub folders removed because their skill is no longer in reach. */
  removed: string[];
  /** Stubs whose skill is gone but whose folder holds files the CLI did not write: the stub is removed, the folder and marker stay. */
  kept: string[];
  /** `team` is the skipped entry's team slug, null for a personal skill. */
  skipped: { name: string; team: string | null; reason: StubSkipReason }[];
  /** A stub that could not be written, refreshed or removed; the others still are. */
  failed: { name: string; team: string | null; error: string }[];
}

/** The server's rules (`SKILL_NAME_PATTERN` / `SKILL_NAME_MAX` in apps/backend/src/db/models/Skill.ts, team `SLUG_RE`). */
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTRY_FILE = 'SKILL.md';
/** The temporary siblings `writeAtomic` creates (and a crash may leave behind). */
const TEMP_FILE = /^(?:SKILL\.md|\.tokenrip-skill\.json)\.tmp-[0-9a-f]{12}$/;

/** Claude Code exports `CLAUDECODE=1` into its tool shells. */
export function defaultSkillTarget(env: Record<string, string | undefined>): SkillTarget {
  return env.CLAUDECODE ? 'claude' : 'agents';
}

export function isSkillTarget(value: string): value is SkillTarget {
  return (SKILL_TARGETS as readonly string[]).includes(value);
}

/** `<home>/.claude/skills` (Claude Code) or `<home>/.agents/skills` (the shared agents folder). */
export function skillTargetDir(target: SkillTarget, homeDir: string): string {
  return path.join(homeDir, target === 'claude' ? '.claude' : '.agents', 'skills');
}

function teamOf(entry: StubEntry): string | null {
  return entry.owner.kind === 'team' ? entry.owner.slug : null;
}

/**
 * A YAML double-quoted scalar. JSON string syntax is valid YAML here; the characters YAML 1.1
 * parsers treat as line breaks (NEL, LS, PS), DEL and the C1 controls, and a BOM are escaped too.
 */
function yamlString(value: string): string {
  return JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufeff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * The stub `SKILL.md`: the catalog's name and description (Unicode format characters such as
 * bidi overrides stripped, as in the MCP server instructions), then how to load the real skill.
 * Every command addresses the skill by id, so a name shared by two operators' personal skills
 * is never ambiguous, and pins `--agent` when a local identity installed it.
 */
export function renderStub(entry: StubEntry, accountId: string | null = null): string {
  const team = teamOf(entry);
  const rip = `rip${accountId ? ` --agent ${accountId}` : ''}`;
  const get = `${rip} skill get ${entry.id}`;
  const owner = team === null
    ? 'a personal skill of your operator'
    : SLUG_PATTERN.test(team) ? `a skill of team \`${team}\`` : 'a team skill';
  return [
    '---',
    `name: ${yamlString(entry.name)}`,
    `description: ${yamlString(entry.description.replace(/\p{Cf}/gu, ''))}`,
    '---',
    '',
    '<!-- Written by `rip skill install`. Re-running it rewrites or removes this folder, so edits here are lost. -->',
    '',
    `# ${entry.name}`,
    '',
    `This skill lives on Tokenrip: ${owner}, id \`${entry.id}\`. This file only says how to load it.`,
    '',
    `1. Run \`${get}\` and follow the instructions it prints. They are always the current version.`,
    `2. The output ends with the skill's file list. Read a file when the instructions point to it: \`${get} --file <path>\`.`,
    `3. If the skill's scripts must run from disk, write every file to a new folder outside any skills folder (for example under the system temp folder), so the copy never shows up as a second skill: \`${get} --dir <temp-folder>/${entry.name}\`.`,
    '',
    `If \`rip\` answers \`SKILL_NOT_FOUND\`, the skill was deleted or is no longer in reach of this agent. \`${rip} skill install\` refreshes these stubs.`,
    '',
  ].join('\n');
}

function renderMarker(entry: StubEntry, installer: StubInstaller): string {
  const marker: StubMarker = { skillId: entry.id, name: entry.name, team: teamOf(entry), accountId: installer.accountId, apiUrl: installer.apiUrl };
  return `${JSON.stringify(marker, null, 2)}\n`;
}

type FolderState =
  | { kind: 'missing' }
  /** A real directory holding nothing, or only CLI temp files: a crash between mkdir and the marker. */
  | { kind: 'empty' }
  /** A real directory holding the marker as a regular file. `accountId` null: none recorded (adoptable). */
  | { kind: 'managed'; accountId: string | null }
  | { kind: 'unmanaged' };

/** Uses lstat throughout, so a symlink, even to a marked folder, is never managed. */
function folderState(folder: string): FolderState {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(folder);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    throw err;
  }
  if (!stat.isDirectory()) return { kind: 'unmanaged' };
  const markerFile = path.join(folder, SKILL_STUB_MARKER);
  let markerStat: fs.Stats | null = null;
  try {
    markerStat = fs.lstatSync(markerFile);
  } catch {
    /* no marker */
  }
  if (markerStat?.isFile()) {
    let accountId: string | null = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
      if (typeof parsed?.accountId === 'string') accountId = parsed.accountId;
    } catch {
      /* unreadable marker: still ours, with no recorded account */
    }
    return { kind: 'managed', accountId };
  }
  if (markerStat === null && fs.readdirSync(folder).every((f) => TEMP_FILE.test(f))) return { kind: 'empty' };
  return { kind: 'unmanaged' };
}

/** A stub with no recorded account is adopted; otherwise it belongs to the account that installed it. */
function ownedBy(state: { accountId: string | null }, installer: StubInstaller): boolean {
  return state.accountId === null || state.accountId === installer.accountId;
}

/** The file's text, or null when it is missing or not a regular file. */
function readRegular(file: string): string | null {
  try {
    return fs.lstatSync(file).isFile() ? fs.readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}

/** Write through a temporary sibling renamed into place, so a reader never sees a partial file. */
function writeAtomic(file: string, content: string): void {
  const temp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temp, content, { flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

function unlinkIfPresent(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * Remove a stub without ever deleting a file the CLI did not write: unlink `SKILL.md` and leftover
 * temp files, then, if only the marker remains, the marker and the folder. A folder that still
 * holds other files keeps them and its marker (so a later run retries) and is reported `kept`.
 */
function removeStub(folder: string): 'removed' | 'kept' {
  unlinkIfPresent(path.join(folder, ENTRY_FILE));
  for (const name of fs.readdirSync(folder)) {
    if (TEMP_FILE.test(name)) unlinkIfPresent(path.join(folder, name));
  }
  if (fs.readdirSync(folder).some((name) => name !== SKILL_STUB_MARKER)) return 'kept';
  unlinkIfPresent(path.join(folder, SKILL_STUB_MARKER));
  try {
    fs.rmdirSync(folder);
  } catch (err) {
    // A file appeared meanwhile: it is not ours, so the folder stays.
    if ((err as NodeJS.ErrnoException).code === 'ENOTEMPTY' || (err as NodeJS.ErrnoException).code === 'EEXIST') return 'kept';
    throw err;
  }
  return 'removed';
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Bring `dir` in line with `entries` for `installer`: write a stub for each skill, refresh changed
 * ones, remove stubs whose skill is gone.
 *
 * - Personal entries claim a name before team entries; a later entry with a claimed name (a team
 *   skill named like a personal one, or a second operator's personal skill) is skipped `name_taken`.
 * - A folder without the marker is never written or removed (`unmanaged`). A stub recorded for
 *   another account is left alone (`other_agent`), so identities sharing a home keep their stubs.
 * - A new stub gets its marker before its `SKILL.md`, both written atomically; a crash before the
 *   marker leaves an empty folder, which the next run takes over.
 * - One stub's failure is reported in `failed`; the others, and the removals, still run.
 */
export function syncStubs(entries: StubEntry[], dir: string, installer: StubInstaller): StubSyncResult {
  const result: StubSyncResult = { written: [], refreshed: [], unchanged: [], removed: [], kept: [], skipped: [], failed: [] };
  fs.mkdirSync(dir, { recursive: true });
  const ordered = [...entries.filter((e) => e.owner.kind !== 'team'), ...entries.filter((e) => e.owner.kind === 'team')];
  const claimed = new Set<string>();

  for (const entry of ordered) {
    const team = teamOf(entry);
    const skip = (reason: StubSkipReason) => result.skipped.push({ name: entry.name, team, reason });
    if (!NAME_PATTERN.test(entry.name) || entry.name.length > NAME_MAX || !UUID_RE.test(entry.id)) {
      skip('invalid_entry');
      continue;
    }
    if (claimed.has(entry.name)) {
      skip('name_taken');
      continue;
    }
    claimed.add(entry.name);

    try {
      const folder = path.join(dir, entry.name);
      const state = folderState(folder);
      if (state.kind === 'unmanaged') {
        skip('unmanaged');
        continue;
      }
      if (state.kind === 'managed' && !ownedBy(state, installer)) {
        skip('other_agent');
        continue;
      }
      const stub = renderStub(entry, installer.accountId);
      const marker = renderMarker(entry, installer);
      const skillFile = path.join(folder, ENTRY_FILE);
      const markerFile = path.join(folder, SKILL_STUB_MARKER);
      if (state.kind === 'missing' || state.kind === 'empty') {
        if (state.kind === 'missing') fs.mkdirSync(folder);
        else for (const name of fs.readdirSync(folder)) if (TEMP_FILE.test(name)) unlinkIfPresent(path.join(folder, name));
        writeAtomic(markerFile, marker);
        writeAtomic(skillFile, stub);
        result.written.push(entry.name);
      } else if (readRegular(skillFile) === stub && readRegular(markerFile) === marker) {
        result.unchanged.push(entry.name);
      } else {
        writeAtomic(skillFile, stub);
        writeAtomic(markerFile, marker);
        result.refreshed.push(entry.name);
      }
    } catch (err) {
      result.failed.push({ name: entry.name, team, error: message(err) });
    }
  }

  for (const name of fs.readdirSync(dir).sort()) {
    if (claimed.has(name)) continue;
    const folder = path.join(dir, name);
    try {
      const state = folderState(folder);
      if (state.kind !== 'managed' || !ownedBy(state, installer)) continue;
      result[removeStub(folder)].push(name);
    } catch (err) {
      result.failed.push({ name, team: null, error: message(err) });
    }
  }
  return result;
}
