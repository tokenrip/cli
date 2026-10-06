import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import { optionalAuthClient, requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { resolveCurrentIdentity } from '../identities.js';
import { outputSuccess } from '../output.js';
import { loadTeams, resolveTeam } from '../teams.js';
import { SKIP_DIRS, walkFiles } from '../zip.js';
import { findSkillCheckout, recordSkillCheckout } from '../skill-checkouts.js';
import { SKILL_TARGETS, defaultSkillTarget, isSkillTarget, skillTargetDir, syncStubs } from '../skill-stubs.js';
import {
  formatSkill,
  formatSkillDeleted,
  formatSkillInstall,
  formatSkillList,
  formatSkillPublished,
  formatSkillSaved,
  formatSkillShared,
} from '../formatters.js';

/** The owner as the API returns it (`GET /v0/skills`, `GET /v0/skills/:id`). */
export type SkillOwner = { kind: 'operator'; alias: string | null } | { kind: 'team'; slug: string; name: string };

export interface SkillCatalogEntry {
  id: string;
  name: string;
  owner: SkillOwner;
  description: string;
  version: number;
  sharing: 'private' | 'link';
  link: string | null;
  publishedAt: string;
}

export interface SkillView {
  id: string;
  name: string;
  description: string;
  owner: SkillOwner;
  sharing: 'private' | 'link';
  link: string | null;
  canManage: boolean;
  version: { number: number; publishedBy: { id: string; alias: string | null } | null; publishedAt: string };
  versions: { number: number; publishedBy: { id: string; alias: string | null } | null; publishedAt: string }[];
  files: { path: string; size: number; sha256: string }[];
  entry: { text: string };
}

type PublishFile = { path: string; text: string } | { path: string; base64: string };

const ENTRY_FILE = 'SKILL.md';
/** The server's per-version limits (`SKILL_MAX_FILES`, `SKILL_MAX_BYTES` in apps/backend/src/db/models/Skill.ts). */
const MAX_FILES = 512;
const MAX_BYTES = 16 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ignoreBOM keeps a leading BOM in the text, so the file round-trips byte for byte.
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * The skill id a link names: a bare id, or an http(s) URL whose path is `/skills/<id>` or
 * `/v0/skills/<id>` (the page, its discovery index, an API file URL). `null` means `ref` is a
 * name. Mirrors the server's `SkillService.idFromLink`.
 */
export function skillIdFromLink(ref: string): string | null {
  const text = ref.trim();
  if (UUID_RE.test(text)) return text.toLowerCase();
  if (!/^https?:\/\//i.test(text)) return null;
  let id: string | undefined;
  try {
    id = /^(?:\/v0)?\/skills\/([^/]+)(?:\/.*)?$/.exec(new URL(text).pathname)?.[1];
  } catch {
    /* not a URL */
  }
  if (!id || !UUID_RE.test(id)) {
    throw new CliError('SKILL_NOT_FOUND', `Not a skill link: ${text}. Use a skill page URL (…/skills/<id>) or the skill id.`);
  }
  return id.toLowerCase();
}

/** A team flag as the catalog names teams: an alias or a cached team id becomes the slug. */
function teamSlug(team: string): string {
  const resolved = resolveTeam(team);
  const cached = Object.values(loadTeams()).find((t) => t.id === resolved.toLowerCase());
  if (cached) return cached.slug;
  // The catalog names teams by slug only, so an id must come through the local team cache.
  if (UUID_RE.test(resolved)) {
    throw new CliError('INVALID_ARGS', `Team ${resolved} is not in the local team cache. Pass the team slug (rip team list shows it).`);
  }
  return resolved;
}

/** Who the CLI is acting as, for messages that depend on reach. */
function identityLabel(): string {
  if (process.env.TOKENRIP_API_KEY) return 'the agent whose API key is in TOKENRIP_API_KEY';
  try {
    const identity = resolveCurrentIdentity();
    return identity.alias ? `agent "${identity.alias}" (${identity.accountId})` : `agent ${identity.accountId}`;
  } catch {
    return 'the current agent';
  }
}

async function fetchCatalog(client: AxiosInstance): Promise<SkillCatalogEntry[]> {
  const { data } = await client.get('/v0/skills');
  return data.data.skills as SkillCatalogEntry[];
}

/**
 * The server's name rule: with a team, that team's skill; without, a personal skill only. Two
 * personal skills with one name (an agent with several operators) are ambiguous.
 */
function findEntry(entries: SkillCatalogEntry[], name: string, slug: string | undefined, purpose: 'read' | 'publish'): SkillCatalogEntry | null {
  const matches = entries.filter((e) => e.name === name
    && (slug === undefined ? e.owner.kind === 'operator' : e.owner.kind === 'team' && e.owner.slug === slug));
  if (matches.length > 1) {
    const ids = matches.map((m) => m.id).join(', ');
    throw new CliError(
      'OPERATOR_AMBIGUOUS',
      purpose === 'publish'
        ? `This agent is linked to more than one operator (${matches.length} of them have a personal skill named "${name}": ${ids}), so a personal skill has no single owner. Publish to a team with --team <slug>, or from an agent linked to one operator.`
        : `More than one of this agent's operators has a personal skill named "${name}": ${ids}. Read it by id: rip skill get <id>.`,
    );
  }
  return matches[0] ?? null;
}

function notFound(entries: SkillCatalogEntry[], name: string, slug?: string): CliError {
  const where = slug ? ` in team "${slug}"` : ' among your personal skills';
  const teams = slug ? [] : entries.filter((e) => e.name === name && e.owner.kind === 'team').map((e) => (e.owner as { slug: string }).slug);
  const teamHint = teams.length ? ` Team skills by that name: ${teams.map((t) => `rip skill get ${name} --team ${t}`).join(', ')}.` : '';
  return new CliError(
    'SKILL_NOT_FOUND',
    `No skill named "${name}"${where} is in reach of ${identityLabel()}.${teamHint} If the skill belongs to another agent's operator or team, run the command as that agent (--agent <name>; see rip account list), or list what this agent can reach with rip skill list.`,
  );
}

/** A skill reference (name, id or link) → its id. Names resolve through the caller's catalog. */
async function locate(ref: string, team: string | undefined, requireAuth: boolean): Promise<{ client: AxiosInstance; id: string; name?: string }> {
  const linked = skillIdFromLink(ref);
  if (linked) {
    if (team) throw new CliError('INVALID_ARGS', '--team selects a skill by name; a link or id already names one skill.');
    return { client: requireAuth ? requireAuthClient().client : optionalAuthClient().client, id: linked };
  }
  const { client } = requireAuthClient();
  const slug = team ? teamSlug(team) : undefined;
  const entries = await fetchCatalog(client);
  const entry = findEntry(entries, ref, slug, 'read');
  if (!entry) throw notFound(entries, ref, slug);
  return { client, id: entry.id, name: entry.name };
}

function apiUrlOf(client: AxiosInstance): string {
  return client.defaults.baseURL ?? '';
}

function fileUrl(id: string, filePath: string, version?: number): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `/v0/skills/${id}/files/${encoded}${version !== undefined ? `?version=${version}` : ''}`;
}

/** `root/rel`, refusing a manifest path that could land outside `root`. */
function safeTarget(root: string, rel: string): string {
  const segments = rel.split('/');
  const unsafe = rel.length === 0 || rel.includes('\\') || rel.includes('\0') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)
    || segments.some((s) => s === '' || s === '.' || s === '..')
    // Never write version-control or dependency folders into a skills folder (same segments the server refuses).
    || segments.some((s) => SKIP_DIRS.has(s.toLowerCase()));
  const abs = path.resolve(root, rel);
  if (unsafe || !abs.startsWith(root + path.sep)) {
    throw new CliError('INVALID_SKILL', `Refusing to write "${rel}": it is not a plain relative path inside ${root}, or it names a .git, .svn, .hg or node_modules entry.`, { reason: 'path' });
  }
  return abs;
}

/** Refuse an existing target that is a file or a non-empty folder. */
function assertEmptyTarget(root: string): void {
  if (!fs.existsSync(root)) return;
  if (!fs.statSync(root).isDirectory() || fs.readdirSync(root).length > 0) {
    throw new CliError('DIR_NOT_EMPTY', `${root} already exists and is not an empty folder. Choose a new folder for --dir.`);
  }
}

/**
 * Every file of the viewed version into `dir`, all or nothing: the files go into a temporary
 * sibling folder that is renamed into place once complete, and removed on any failure.
 */
async function writeSkillDir(client: AxiosInstance, view: SkillView, dir: string): Promise<void> {
  const root = path.resolve(dir);
  assertEmptyTarget(root);
  const temp = `${root}.partial-${randomBytes(6).toString('hex')}`;
  // Every path is checked before anything is written.
  const targets = view.files.map((file) => ({ file, abs: safeTarget(temp, file.path) }));
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(temp);
  try {
    for (const { file, abs } of targets) {
      const res = await client.get(fileUrl(view.id, file.path, view.version.number), { responseType: 'arraybuffer' });
      const bytes = Buffer.from(res.data);
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new CliError('INTEGRITY_ERROR', `${file.path} does not match its manifest digest. Run the command again.`);
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes, { flag: 'wx' });
    }
    assertEmptyTarget(root);
    if (fs.existsSync(root)) fs.rmdirSync(root);
    fs.renameSync(temp, root);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw err;
  }
  // A later `rip skill publish <folder>` is checked against this version.
  recordSkillCheckout(root, { skillId: view.id, version: view.version.number, apiUrl: apiUrlOf(client) });
  outputSuccess(
    { id: view.id, name: view.name, version: view.version.number, dir: root, files: view.files.map((f) => f.path) },
    formatSkillSaved,
  );
}

/** `rip skill list` — every skill in reach (personal, then each team); `--team` keeps one team's. */
export async function skillList(options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  let skills = await fetchCatalog(client);
  if (options.team) {
    const slug = teamSlug(options.team);
    skills = skills.filter((s) => s.owner.kind === 'team' && s.owner.slug === slug);
  }
  outputSuccess({ skills }, formatSkillList);
}

/**
 * `rip skill get <name|id|url>` — print the instructions and the file list; `--file` writes one
 * file's raw bytes to stdout; `--dir` writes every file of the version into a new folder. A link
 * or id is read with whatever identity exists (none is needed for a link-shared skill).
 */
export async function skillGet(ref: string, options: { team?: string; file?: string; dir?: string }): Promise<void> {
  if (options.file !== undefined && options.dir) throw new CliError('INVALID_ARGS', 'Use either --file or --dir, not both.');
  if (options.file !== undefined && options.file.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new CliError('INVALID_ARGS', `--file takes a path from the skill's file list, such as references/style.md (got "${options.file}").`);
  }
  if (options.dir) assertEmptyTarget(path.resolve(options.dir));
  const { client, id } = await locate(ref, options.team, false);
  if (options.file !== undefined) {
    const res = await client.get(fileUrl(id, options.file), { responseType: 'arraybuffer' });
    process.stdout.write(Buffer.from(res.data));
    return;
  }
  const { data } = await client.get(`/v0/skills/${id}`);
  const view = data.data as SkillView;
  if (options.dir) {
    await writeSkillDir(client, view, options.dir);
    return;
  }
  outputSuccess(view as unknown as Record<string, unknown>, formatSkill);
}

/** The `name:` value of a `SKILL.md` frontmatter block, or null. */
function frontmatterName(text: string): string | null {
  // The server's block rule (apps/backend/src/api/util/skill-frontmatter.ts): `---` first, so no BOM.
  const block = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  const line = block ? /^name:[ \t]*(.*?)[ \t]*\r?$/m.exec(block[1] ?? '') : null;
  let value = line?.[1] ?? '';
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
  return value || null;
}

/** Well-formed UTF-8 travels as text, anything else as base64. */
function encodeFile(filePath: string, data: Buffer): PublishFile {
  try {
    return { path: filePath, text: UTF8.decode(data) };
  } catch {
    return { path: filePath, base64: data.toString('base64') };
  }
}

/**
 * `rip skill publish <folder>` — publish the folder as the next version of the skill its
 * `SKILL.md` names (creating it on first publish). The folder is compared with its **base
 * version**: `--expected-version`, else the version the folder was checked out at (`get --dir`)
 * or last published as, else the current version. Only files that are new or differ from the
 * base are sent, files of the base gone from the folder are removed, and the base is sent as
 * `expectedVersion`, so a publish by someone else since the base answers `CONFLICT` instead of
 * being reverted. An unchanged folder publishes nothing. Symbolic links and hidden files are
 * refused, never uploaded silently.
 */
export async function skillPublish(folder: string, options: { team?: string; expectedVersion?: string | number }): Promise<void> {
  const explicit = options.expectedVersion === undefined ? undefined : parseExpectedVersion(options.expectedVersion);
  const root = path.resolve(folder);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new CliError('DIR_NOT_FOUND', `Directory not found: ${root}`);
  }
  const walked = walkFiles(root, { strict: true });
  if (!walked.some((f) => f.path === ENTRY_FILE)) {
    throw new CliError('INVALID_SKILL', `No ${ENTRY_FILE} at the root of ${root}. A skill folder needs ${ENTRY_FILE} with name and description frontmatter.`, { reason: 'missing_entry' });
  }
  // The server's limits, checked from sizes before any file is read.
  if (walked.length > MAX_FILES) {
    throw new CliError('INVALID_SKILL', `${root} holds ${walked.length} files; a skill version holds at most ${MAX_FILES}.`, { reason: 'file_count' });
  }
  const totalBytes = walked.reduce((n, f) => n + f.sizeBytes, 0);
  if (totalBytes > MAX_BYTES) {
    throw new CliError('INVALID_SKILL', `${root} holds ${totalBytes} bytes; a skill version holds at most 16 MiB.`, { reason: 'total_size' });
  }

  const local = walked.map((f) => {
    const data = fs.readFileSync(f.absolutePath);
    return { path: f.path, data, sha256: createHash('sha256').update(data).digest('hex') };
  });
  const entryFile = encodeFile(ENTRY_FILE, local.find((f) => f.path === ENTRY_FILE)!.data);
  if (!('text' in entryFile)) throw new CliError('INVALID_SKILL', `${ENTRY_FILE} must be UTF-8 text.`, { reason: 'encoding' });
  const name = frontmatterName(entryFile.text);
  if (!name) {
    throw new CliError('INVALID_SKILL', `${ENTRY_FILE} needs a frontmatter block that starts the file (---, with no byte-order mark before it) and holds a name: line.`, { reason: 'frontmatter' });
  }

  const slug = options.team ? teamSlug(options.team) : undefined;
  const { client } = requireAuthClient();
  const current = findEntry(await fetchCatalog(client), name, slug, 'publish');
  const apiUrl = apiUrlOf(client);
  const checkout = current ? findSkillCheckout(root, apiUrl) : null;
  const basedOn: 'explicit' | 'checkout' | 'current' = explicit !== undefined ? 'explicit'
    : checkout && checkout.skillId === current!.id ? 'checkout' : 'current';
  let expectedVersion = explicit ?? (basedOn === 'checkout' ? checkout!.version : 0);
  let changed = local;
  let removals: string[] = [];
  if (current && (basedOn === 'current' || expectedVersion > 0)) {
    // The base version's manifest: what this folder is a change set against.
    const { data } = await client.get(`/v0/skills/${current.id}`, basedOn === 'current' ? {} : { params: { version: expectedVersion } });
    const view = data.data as SkillView;
    expectedVersion = view.version.number;
    const remote = new Map(view.files.map((f) => [f.path, f.sha256]));
    const localPaths = new Set(local.map((f) => f.path));
    changed = local.filter((f) => remote.get(f.path) !== f.sha256);
    removals = view.files.map((f) => f.path).filter((p) => !localPaths.has(p));
    if (changed.length === 0 && removals.length === 0) {
      outputSuccess(
        { skill: { id: view.id, name: view.name, owner: view.owner, sharing: view.sharing, link: view.link }, version: expectedVersion, created: false, unchanged: true, basedOn, baseVersion: expectedVersion, sent: 0, removed: [] },
        formatSkillPublished,
      );
      return;
    }
  }

  const files = changed.map((f) => encodeFile(f.path, f.data));
  let data: any;
  try {
    ({ data } = await client.post(
      '/v0/skills/publish',
      { name, ...(slug ? { team: slug } : {}), files, removals, expectedVersion },
      { maxBodyLength: Infinity, maxContentLength: Infinity },
    ));
  } catch (err) {
    if (err instanceof CliError && err.code === 'CONFLICT') {
      const now = err.details && !Array.isArray(err.details) ? err.details.currentRevision : undefined;
      const getArgs = `${name}${slug ? ` --team ${slug}` : ''}`;
      throw new CliError(
        'CONFLICT',
        `${name} has changed since version ${expectedVersion}, which this folder is based on${now ? ` (it is now at version ${now})` : ''}. Nothing was published. Fetch the current version into a new folder with \`rip skill get ${getArgs} --dir <new-folder>\`, merge your changes into it, and publish that folder.`,
        err.details,
      );
    }
    if (err instanceof CliError && err.code === 'PAYLOAD_TOO_LARGE') {
      throw new CliError('PAYLOAD_TOO_LARGE', `The server refused the request as too large (${files.length} changed files). A skill version holds at most 16 MiB; remove or shrink large files, or publish the changes in smaller steps.`);
    }
    throw err;
  }
  const receipt = data.data as { skill: { id: string }; version: number };
  // The folder now matches the version it just published.
  recordSkillCheckout(root, { skillId: receipt.skill.id, version: receipt.version, apiUrl });
  outputSuccess({ ...data.data, basedOn, baseVersion: expectedVersion, sent: files.length, removed: removals }, formatSkillPublished);
}

function parseExpectedVersion(value: string | number): number {
  const n = typeof value === 'number' ? value : /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new CliError('INVALID_ARGS', `--expected-version takes a version number (0 for a skill that must not exist yet), got "${value}".`);
  }
  return n;
}

/** `rip skill share <name|id> --link|--private` — share by link, or stop sharing. */
export async function skillShare(ref: string, options: { team?: string; link?: boolean; private?: boolean }): Promise<void> {
  if (!!options.link === !!options.private) throw new CliError('INVALID_ARGS', 'Pass exactly one of --link or --private.');
  const { client, id } = await locate(ref, options.team, true);
  const { data } = await client.patch(`/v0/skills/${id}`, { sharing: options.link ? 'link' : 'private' });
  outputSuccess(data.data, formatSkillShared);
}

/** `rip skill delete <name|id>` — delete the skill and every version. */
export async function skillDelete(ref: string, options: { team?: string }): Promise<void> {
  const { client, id, name } = await locate(ref, options.team, true);
  await client.delete(`/v0/skills/${id}`);
  outputSuccess({ id, ...(name ? { name } : {}), deleted: true }, formatSkillDeleted);
}

/**
 * `rip skill install [--target claude|agents]` — write a stub folder for every skill in reach into
 * the host's user-level skills folder, so the host triggers each skill natively; refresh changed
 * stubs and remove stubs whose skill is gone. Only folders carrying the stub marker, recorded for
 * this identity (or for none), are touched; each stub reads its skill by id as this identity.
 * The default target is Claude Code's folder when the CLI runs inside it (`CLAUDECODE`).
 */
export async function skillInstall(options: { target?: string }, deps: { homeDir: string } = { homeDir: os.homedir() }): Promise<void> {
  const target = options.target ?? defaultSkillTarget(process.env);
  if (!isSkillTarget(target)) {
    throw new CliError('INVALID_ARGS', `--target must be one of ${SKILL_TARGETS.join(', ')} (got "${target}").`);
  }
  const { client, apiUrl } = requireAuthClient();
  // The stubs pin the local identity with --agent; an API key in the environment has no local identity.
  const accountId = process.env.TOKENRIP_API_KEY ? null : resolveCurrentIdentity().accountId;
  const entries = await fetchCatalog(client);
  const dir = skillTargetDir(target, deps.homeDir);
  outputSuccess({ target, dir, accountId, ...syncStubs(entries, dir, { accountId, apiUrl }) }, formatSkillInstall);
}
