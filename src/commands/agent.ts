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
  formatAgent,
  formatAgentList,
  formatAgentDryRun,
  formatAgentPublished,
  formatAgentScaffold,
  formatUnmounted,
  formatTheme,
  formatThemeList,
} from '../formatters.js';
import { outputSuccess } from '../output.js';

export async function agentPublish(
  manifestPath: string,
  options: {
    publish?: boolean;
    published?: boolean;
    featured?: string;
    team?: string;
    dryRun?: boolean;
  },
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
  if (options.dryRun) body.dryRun = true;

  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/agents', body);

  if (options.dryRun) {
    // Dry-run returns the validation envelope directly (not wrapped in data.data).
    // We surface it whole — both the structured form (JSON mode) and the
    // human-readable diff (formatter). Exit 1 when validation failed so shell
    // pipelines can detect the failure.
    outputSuccess(data as Record<string, unknown>, formatAgentDryRun);
    if (data.ok === false) process.exit(1);
    return;
  }

  outputSuccess(data.data, formatAgentPublished);
}

/**
 * Validate a manifest without publishing. Thin wrapper around
 * `agentPublish(manifestPath, { dryRun: true })` — present as its own
 * subcommand for discoverability (MOA and pre-commit hooks call this).
 */
export async function agentValidate(manifestPath: string): Promise<void> {
  await agentPublish(manifestPath, { dryRun: true });
}

export async function agentShow(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/agents/mine/${encodeURIComponent(slug)}`);
  outputSuccess(data.data, formatAgent);
}

export async function agentList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/agents/mine');
  outputSuccess(data.data, formatAgentList);
}

export async function agentArtifacts(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/agents/mine/${encodeURIComponent(slug)}/artifacts`);
  outputSuccess(data.data, formatImprintArtifacts);
}

export async function agentFork(
  templateSlug: string,
  options: { team?: string; slug?: string; outputDir?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { templateSlug };
  if (options.team) body.teamSlug = options.team;
  if (options.slug) body.newSlug = options.slug;

  const { data } = await client.post('/v0/agents/fork', body);
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
  }, formatAgentScaffold);
}

export async function agentMount(
  imprintSlug: string,
  options: { team?: string; name?: string; contextFrom?: string; workspace?: string[] },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { imprintSlug };
  if (options.team) body.teamSlug = options.team;
  if (options.name) body.name = options.name;
  if (options.contextFrom) body.contextMd = readFileSync(options.contextFrom, 'utf-8');
  if (options.workspace?.length) body.workspaceBindings = parseBindingPairs(options.workspace);
  const { data } = await client.post('/v0/mounts', body);
  outputSuccess(data.data, formatMount);
}

/** Parse repeatable `name=<workspace id or slug>` pairs. */
function parseBindingPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0 || idx === pair.length - 1) {
      throw new CliError('INVALID_WORKSPACE_BINDING', `Expected name=<workspace>, got '${pair}'`);
    }
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

export async function agentMountWorkspace(
  mountId: string,
  binding: string | undefined,
  options: { unbind?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  if (options.unbind) {
    await client.delete(`/v0/mounts/${encodeURIComponent(mountId)}/workspace-bindings/${encodeURIComponent(options.unbind)}`);
    outputSuccess({ mountId, unbound: options.unbind });
    return;
  }
  if (!binding) throw new CliError('INVALID_WORKSPACE_BINDING', 'Pass name=<workspace> or --unbind <name>');
  const pairs = parseBindingPairs([binding]);
  const [name, ref] = Object.entries(pairs)[0];
  const { data } = await client.put(
    `/v0/mounts/${encodeURIComponent(mountId)}/workspace-bindings/${encodeURIComponent(name)}`,
    { workspace: ref },
  );
  outputSuccess(data.data);
}

export async function agentMounts(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/mounts');
  outputSuccess(data.data, formatMountList);
}

export async function agentMountRename(mountId: string, newName: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/mounts/${encodeURIComponent(mountId)}`, { name: newName });
  outputSuccess(data.data, formatMount);
}

export async function agentShowMount(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mounts/${encodeURIComponent(mountId)}`);
  outputSuccess(data.data, formatMountDrillIn);
}

export async function agentMountArtifacts(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mounts/${encodeURIComponent(mountId)}/artifacts`);
  outputSuccess(data.data, formatMountArtifacts);
}

export async function agentMountContext(
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

export async function agentUnmount(
  mountId: string,
  options: { keepOutputs?: boolean } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/mounts/${encodeURIComponent(mountId)}`, {
    data: { keepOutputs: options.keepOutputs === true },
  });
  outputSuccess({ id: mountId, unmounted: true }, formatUnmounted);
}

export async function agentUnpublish(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/agents/${encodeURIComponent(slug)}`, { isPublished: false });
  outputSuccess(data.data, formatAgent);
}

export async function agentPublishToggle(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data: current } = await client.get(`/v0/agents/mine/${encodeURIComponent(slug)}`);
  const next = !current.data.isPublished;
  const { data } = await client.patch(`/v0/agents/${encodeURIComponent(slug)}`, { isPublished: next });
  outputSuccess(data.data, formatAgent);
}

export async function agentSetFeatured(slug: string, weightArg: string): Promise<void> {
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
  const { data } = await client.patch(`/v0/agents/${encodeURIComponent(slug)}`, { isFeatured: weight });
  outputSuccess(data.data, formatAgent);
}

export async function agentSetDisplay(
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
  const { data } = await client.patch(`/v0/agents/${encodeURIComponent(slug)}/display`, body);
  outputSuccess(data.data, formatAgent);
}

export async function agentDelete(
  slug: string,
  options: { force?: boolean; keepOutputs?: boolean },
): Promise<void> {
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
  await client.delete(`/v0/agents/${encodeURIComponent(slug)}`, {
    data: { keepOutputs: options.keepOutputs === true },
  });
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

export async function agentLoad(
  slug: string,
  options: {
    team?: string;
    personal?: boolean;
    command?: string;
    capabilities?: string;
    probedAt?: string;
  },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = {};
  if (options.team) body.team = options.team;
  if (options.personal) body.personal = true;
  if (options.command) body.command = options.command;
  if (options.capabilities !== undefined) {
    body.capabilities = parseCapabilitiesOption(options.capabilities);
  }
  if (options.probedAt) body.probedAt = options.probedAt;
  const { data } = await client.post(
    `/v0/agents/${encodeURIComponent(slug)}/sessions`,
    body,
  );
  // No human formatter — load output is structured for programmatic use only.
  outputSuccess(data.data);
  // Two-phase handshake: a probeManifest (not a session) comes back when the
  // imprint declares tools[] and no capabilities were advertised. Nudge the
  // caller to re-invoke with --capabilities. TTY-gated so JSON stays clean.
  if (
    data.data &&
    typeof data.data === 'object' &&
    'probeManifest' in data.data &&
    process.stderr.isTTY
  ) {
    console.error(
      'Hint: this agent declares tools and needs a capability probe. Probe each ' +
        "candidate's `requires` locally, then re-run with --capabilities " +
        '\'[{"type":"local-cli","name":"<name>"}, ...]\' (use \'[]\' if nothing is ' +
        'required). server-credential caps are added server-side — skip them.',
    );
  }
}

/** Parse the `--capabilities` JSON flag into a Capability[] for the load body. */
function parseCapabilitiesOption(raw: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliError(
      'INVALID_JSON',
      `--capabilities is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new CliError(
      'INVALID_CAPABILITIES',
      '--capabilities must be a JSON array of Capability objects ' +
        '(e.g. \'[{"type":"local-cli","name":"tw"}]\' or \'[]\')',
    );
  }
  return parsed;
}

// ── themes ───────────────────────────────────────────────────────────
// Durable cross-session working clusters on a mount. `upsert` needs an active
// session token; `list`/`show` read by mount id.

export async function agentThemeUpsert(
  sessionToken: string,
  slug: string,
  options: { summary?: string; name?: string; current?: boolean },
): Promise<void> {
  if (!options.summary) {
    throw new CliError('INVALID_THEME', 'Provide --summary <text> (the theme state body)');
  }
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { slug, summary: options.summary };
  if (options.name) body.name = options.name;
  if (options.current) body.isCurrent = true;
  const { data } = await client.post(
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/theme-upserts`,
    body,
  );
  outputSuccess(data.data, formatTheme);
}

export async function agentThemeList(
  mountId: string,
  options: { includeArchived?: boolean },
): Promise<void> {
  const { client } = requireAuthClient();
  const suffix = options.includeArchived ? '?includeArchived=true' : '';
  const { data } = await client.get(
    `/v0/mounts/${encodeURIComponent(mountId)}/themes${suffix}`,
  );
  outputSuccess(data.data, formatThemeList);
}

export async function agentThemeShow(mountId: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/mounts/${encodeURIComponent(mountId)}/themes/${encodeURIComponent(slug)}`,
  );
  outputSuccess(data.data, formatTheme);
}

// ── per-mount config ─────────────────────────────────────────────────

export async function agentMountConfig(
  mountId: string,
  options: { imprintConfig?: string },
): Promise<void> {
  if (options.imprintConfig === undefined) {
    throw new CliError('INVALID_IMPRINT_CONFIG', 'Provide --imprint-config <json|null> (use null to clear)');
  }
  let imprintConfig: unknown;
  try {
    imprintConfig = JSON.parse(options.imprintConfig);
  } catch (err) {
    throw new CliError('INVALID_JSON', `--imprint-config is not valid JSON: ${(err as Error).message}`);
  }
  if (imprintConfig !== null && (typeof imprintConfig !== 'object' || Array.isArray(imprintConfig))) {
    throw new CliError('INVALID_IMPRINT_CONFIG', '--imprint-config must be a JSON object or null');
  }
  const { client } = requireAuthClient();
  const { data } = await client.put(
    `/v0/mounts/${encodeURIComponent(mountId)}/imprint-config`,
    { imprintConfig },
  );
  outputSuccess(data.data, formatMount);
}

export async function agentMountGrants(
  mountId: string,
  options: { connections?: string },
): Promise<void> {
  if (options.connections === undefined) {
    throw new CliError('INVALID_GRANTS', 'Provide --connections <json> (a JSON array of connection names; [] to clear)');
  }
  let grantedConnections: unknown;
  try {
    grantedConnections = JSON.parse(options.connections);
  } catch (err) {
    throw new CliError('INVALID_JSON', `--connections is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(grantedConnections) || !grantedConnections.every((c) => typeof c === 'string')) {
    throw new CliError('INVALID_GRANTS', '--connections must be a JSON array of connection-name strings');
  }
  const { client } = requireAuthClient();
  const { data } = await client.put(
    `/v0/mounts/${encodeURIComponent(mountId)}/granted-connections`,
    { grantedConnections },
  );
  outputSuccess(data.data, formatMount);
}

export async function agentRecord(
  sessionToken: string,
  options: { table?: string; row?: string; rowFile?: string },
): Promise<void> {
  const payload = readJsonOption(options.row, options.rowFile, '--row / --row-file');
  const body: Record<string, unknown> = { payload };
  if (options.table) body.table = options.table;
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/rows`,
    body,
  );
  outputSuccess(data.data);
}

export async function agentRewriteArtifact(
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
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/artifact-rewrites`,
    { alias, content },
  );
  outputSuccess(data.data);
}

export async function agentToolExecute(
  sessionToken: string,
  bind: string,
  options: { args?: string; argsFile?: string },
): Promise<void> {
  let args: Record<string, unknown> = {};
  if (options.args !== undefined || options.argsFile !== undefined) {
    args = readJsonOption(options.args, options.argsFile, '--args / --args-file');
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/tool-execute`,
    { bind, args },
  );
  outputSuccess(data.data);
}

export async function agentToolSubmit(
  sessionToken: string,
  bind: string,
  options: {
    payload?: string;
    payloadFile?: string;
    provenanceSource?: string;
    provenanceNonce?: string;
  },
): Promise<void> {
  const payload = readJsonOption(options.payload, options.payloadFile, '--payload / --payload-file');
  const provenanceSource = options.provenanceSource ?? 'harness';
  if (provenanceSource !== 'harness' && provenanceSource !== 'webhook' && provenanceSource !== 'system') {
    throw new CliError(
      'INVALID_PROVENANCE',
      `--provenance-source must be one of "harness", "webhook", "system" (got: ${provenanceSource})`,
    );
  }
  const body: Record<string, unknown> = { bind, payload, provenanceSource };
  if (options.provenanceNonce) body.provenanceNonce = options.provenanceNonce;
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/tool-submit`,
    body,
  );
  outputSuccess(data.data);
}

export async function agentEnd(
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
    `/v0/agent-sessions/${encodeURIComponent(sessionToken)}/end`,
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
