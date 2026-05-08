import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import {
  formatImprintArtifacts,
  formatMount,
  formatMountArtifacts,
  formatMountContext,
  formatMountDrillIn,
  formatMountList,
  formatMountedAgent,
  formatMountedAgentList,
  formatMountedAgentPublished,
  formatMountedAgentScaffold,
  formatUnmounted,
} from '../formatters.js';
import { outputSuccess } from '../output.js';

export async function mountedAgentPublish(
  manifestPath: string,
  options: { publish?: boolean; published?: boolean; featured?: string; team?: string },
): Promise<void> {
  const manifest = readManifest(manifestPath);
  const body: Record<string, unknown> = { manifest };

  // Legacy --published → --publish with deprecation warning (TTY-gated, stderr).
  let wantsPublish = options.publish ?? false;
  if (options.published) {
    if (process.stderr.isTTY) {
      console.warn('warning: --published is deprecated; use --publish for v2 (Tier 2 public listing). Mapping for now.');
    }
    wantsPublish = true;
  }
  if (wantsPublish) body.publish = true;

  if (options.featured !== undefined) {
    const parsed = Number.parseInt(options.featured, 10);
    if (!Number.isFinite(parsed)) {
      throw new CliError('INVALID_FEATURED', '--featured must be an integer');
    }
    body.isFeatured = parsed;
  }
  if (options.team) body.teamSlug = options.team;

  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/mountedagents', body);
  outputSuccess(data.data, formatMountedAgentPublished);
}

export async function mountedAgentShow(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mountedagents/mine/${encodeURIComponent(slug)}`);
  outputSuccess(data.data, formatMountedAgent);
}

export async function mountedAgentList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/mountedagents/mine');
  outputSuccess(data.data, formatMountedAgentList);
}

export async function mountedAgentArtifacts(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mountedagents/mine/${encodeURIComponent(slug)}/artifacts`);
  outputSuccess(data.data, formatImprintArtifacts);
}

export async function mountedAgentFork(
  templateSlug: string,
  options: { team?: string; slug?: string; outputDir?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { templateSlug };
  if (options.team) body.teamSlug = options.team;
  if (options.slug) body.newSlug = options.slug;

  const { data } = await client.post('/v0/mountedagents/fork', body);
  const fork = data.data as {
    slug: string;
    manifest: unknown;
    scaffoldFiles?: Array<{ path: string; contentUrl: string; artifactAlias: string }>;
  };

  const root = options.outputDir ?? process.cwd();
  const scaffoldRoot = path.join(root, 'mountedagents', fork.slug);
  mkdirSync(scaffoldRoot, { recursive: true });
  writeFileSync(path.join(scaffoldRoot, 'manifest.json'), `${JSON.stringify(fork.manifest, null, 2)}\n`);

  for (const file of fork.scaffoldFiles ?? []) {
    const target = path.join(root, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    const response = await client.get(file.contentUrl, { responseType: 'arraybuffer' });
    writeFileSync(target, Buffer.from(response.data).toString('utf-8'));
  }

  outputSuccess({
    slug: fork.slug,
    path: path.relative(root, scaffoldRoot),
    nextStep: `/moa --iterate ${fork.slug}`,
  }, formatMountedAgentScaffold);
}

export async function mountedAgentMount(
  imprintSlug: string,
  options: { team?: string; name?: string; contextFrom?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { imprintSlug };
  if (options.team) body.teamSlug = options.team;
  if (options.name) body.name = options.name;
  if (options.contextFrom) body.contextMd = readFileSync(options.contextFrom, 'utf-8');
  const { data } = await client.post('/v0/mounts', body);
  outputSuccess(data.data, formatMount);
}

export async function mountedAgentMounts(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/mounts');
  outputSuccess(data.data, formatMountList);
}

export async function mountedAgentMountRename(mountId: string, newName: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/mounts/${encodeURIComponent(mountId)}`, { name: newName });
  outputSuccess(data.data, formatMount);
}

export async function mountedAgentShowMount(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mounts/${encodeURIComponent(mountId)}`);
  outputSuccess(data.data, formatMountDrillIn);
}

export async function mountedAgentMountArtifacts(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mounts/${encodeURIComponent(mountId)}/artifacts`);
  outputSuccess(data.data, formatMountArtifacts);
}

export async function mountedAgentMountContext(
  mountId: string,
  options: { fromFile?: string; edit?: boolean },
): Promise<void> {
  if (options.fromFile && options.edit) {
    throw new CliError('INVALID_MOUNT_CONTEXT', 'Use either --from-file or --edit, not both');
  }
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mounts/${encodeURIComponent(mountId)}/context`);
  const current = data.data as { contextArtifact?: { publicId?: string } | null; content?: string };
  const publicId = current.contextArtifact?.publicId;
  if (!publicId) {
    throw new CliError('MOUNT_CONTEXT_NOT_FOUND', 'This mount does not have a context artifact');
  }

  if (options.fromFile) {
    const content = readFileSync(options.fromFile, 'utf-8');
    const { data: updated } = await client.post(`/v0/artifacts/${encodeURIComponent(publicId)}/versions`, {
      type: 'markdown',
      content,
    });
    outputSuccess({ ...current, updatedVersion: updated.data.version }, formatMountContext);
    return;
  }

  if (options.edit) {
    const editor = process.env.EDITOR || process.env.VISUAL;
    if (!editor) throw new CliError('EDITOR_REQUIRED', 'Set $EDITOR or use --from-file');
    const dir = mkdtempSync(path.join(tmpdir(), 'tokenrip-mount-context-'));
    const file = path.join(dir, 'context.md');
    writeFileSync(file, current.content ?? '');
    const result = spawnSync(editor, [file], { stdio: 'inherit' });
    if (result.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new CliError('EDITOR_FAILED', `$EDITOR exited with status ${result.status}`);
    }
    const content = readFileSync(file, 'utf-8');
    rmSync(dir, { recursive: true, force: true });
    const { data: updated } = await client.post(`/v0/artifacts/${encodeURIComponent(publicId)}/versions`, {
      type: 'markdown',
      content,
    });
    outputSuccess({ ...current, updatedVersion: updated.data.version }, formatMountContext);
    return;
  }

  outputSuccess(current, formatMountContext);
}

export async function mountedAgentUnmount(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/mounts/${encodeURIComponent(mountId)}`);
  outputSuccess({ id: mountId, unmounted: true }, formatUnmounted);
}

export async function mountedAgentUnpublish(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/mountedagents/${encodeURIComponent(slug)}`, { isPublished: false });
  outputSuccess(data.data, formatMountedAgent);
}

export async function mountedAgentPublishToggle(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data: current } = await client.get(`/v0/mountedagents/mine/${encodeURIComponent(slug)}`);
  const next = !current.data.isPublished;
  const { data } = await client.patch(`/v0/mountedagents/${encodeURIComponent(slug)}`, { isPublished: next });
  outputSuccess(data.data, formatMountedAgent);
}

export async function mountedAgentSetFeatured(slug: string, weightArg: string): Promise<void> {
  let weight: number | null;
  if (weightArg === 'clear' || weightArg === 'null') {
    weight = null;
  } else {
    weight = Number.parseInt(weightArg, 10);
    if (!Number.isFinite(weight)) {
      throw new CliError('INVALID_FEATURED', 'Weight must be an integer or "clear"');
    }
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/mountedagents/${encodeURIComponent(slug)}`, { isFeatured: weight });
  outputSuccess(data.data, formatMountedAgent);
}

export async function mountedAgentSetDisplay(
  slug: string,
  options: { displayName?: string; tagline?: string; description?: string; capability?: string[] },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (options.displayName !== undefined) body.displayName = options.displayName;
  if (options.tagline !== undefined) body.tagline = options.tagline;
  if (options.description !== undefined) body.description = options.description;
  if (options.capability !== undefined && options.capability.length > 0) body.capabilities = options.capability;

  if (Object.keys(body).length === 0) {
    throw new CliError(
      'NO_FIELDS',
      'Pass at least one of --display-name / --tagline / --description / --capability',
    );
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/mountedagents/${encodeURIComponent(slug)}/display`, body);
  outputSuccess(data.data, formatMountedAgent);
}

export async function mountedAgentDelete(slug: string, options: { force?: boolean }): Promise<void> {
  if (!options.force) {
    if (!process.stdin.isTTY) {
      throw new CliError('CONFIRMATION_REQUIRED', 'Pass --force or run interactively');
    }
    const ok = await confirmTypedSlug(slug);
    if (!ok) {
      outputSuccess({ slug, deleted: false, reason: 'cancelled' });
      return;
    }
  }
  const { client } = requireAuthClient();
  await client.delete(`/v0/mountedagents/${encodeURIComponent(slug)}`);
  outputSuccess({ slug, deleted: true });
}

async function confirmTypedSlug(slug: string): Promise<boolean> {
  process.stdout.write(`Type "${slug}" to confirm delete: `);
  const input = await new Promise<string>((resolve) => {
    process.stdin.once('data', (buf) => resolve(buf.toString().trim()));
  });
  return input === slug;
}

function readManifest(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError('FILE_NOT_FOUND', `Manifest file not found: ${path}`);
    }
    throw new CliError('INVALID_JSON', `Manifest file must contain valid JSON: ${path}`);
  }
}

// ─── Session lifecycle ──────────────────────────────────────────────
//
// These four commands mirror the MCP tool surface (`mountedagent_load`,
// `_record`, `_rewrite_artifact`, `_session_end`) so the bootloader skill can
// drive a tracked session from Claude Code via Bash, no MCP setup required.
//
// JSON-only output by design — the bootloader pipes results into `jq`. The
// global `--json` flag is already implied for these (we always write
// machine-readable JSON regardless of `outputFormat` config).

export async function mountedAgentLoad(
  slug: string,
  options: { team?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = {};
  if (options.team) body.team = options.team;
  const { data } = await client.post(
    `/v0/mountedagents/${encodeURIComponent(slug)}/sessions`,
    body,
  );
  // No human formatter — load output is structured for programmatic use only.
  outputSuccess(data.data);
}

export async function mountedAgentRecord(
  sessionToken: string,
  options: { collection?: string; row?: string; rowFile?: string },
): Promise<void> {
  const payload = readJsonOption(options.row, options.rowFile, '--row / --row-file');
  const body: Record<string, unknown> = { payload };
  if (options.collection) body.collection = options.collection;
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/ma-sessions/${encodeURIComponent(sessionToken)}/rows`,
    body,
  );
  outputSuccess(data.data);
}

export async function mountedAgentRewriteArtifact(
  sessionToken: string,
  alias: string,
  options: { content?: string; contentFrom?: string },
): Promise<void> {
  if (options.content !== undefined && options.contentFrom !== undefined) {
    throw new CliError('INVALID_REWRITE', 'Use either --content or --content-from, not both');
  }
  let content: string;
  if (options.content !== undefined) {
    content = options.content;
  } else if (options.contentFrom !== undefined) {
    content = readContentFile(options.contentFrom);
  } else {
    throw new CliError('INVALID_REWRITE', 'Pass --content <string> or --content-from <file>');
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/ma-sessions/${encodeURIComponent(sessionToken)}/artifact-rewrites`,
    { alias, content },
  );
  outputSuccess(data.data);
}

export async function mountedAgentEnd(
  sessionToken: string,
  options: { summary?: string; outputFrom?: string; outputTitle?: string; outputPublic?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (options.summary !== undefined) body.summary = options.summary;
  if (options.outputFrom !== undefined) {
    if (!options.outputTitle) {
      throw new CliError('INVALID_END', '--output-title is required when --output-from is set');
    }
    body.sessionOutput = {
      title: options.outputTitle,
      content: readContentFile(options.outputFrom),
      isPublic: options.outputPublic ?? false,
    };
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/ma-sessions/${encodeURIComponent(sessionToken)}/end`,
    body,
  );
  outputSuccess(data.data);
}

function readJsonOption(
  inline: string | undefined,
  filePath: string | undefined,
  label: string,
): Record<string, unknown> {
  if (inline !== undefined && filePath !== undefined) {
    throw new CliError('INVALID_RECORD', `Pass either ${label} inline or as a file, not both`);
  }
  let raw: string;
  if (inline !== undefined) {
    raw = inline;
  } else if (filePath !== undefined) {
    raw = readContentFile(filePath);
  } else {
    throw new CliError('INVALID_RECORD', `Provide ${label} <json>`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CliError('INVALID_JSON', `${label} must decode to a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError('INVALID_JSON', `${label} is not valid JSON: ${(err as Error).message}`);
  }
}

function readContentFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError('FILE_NOT_FOUND', `File not found: ${path}`);
    }
    throw err;
  }
}
