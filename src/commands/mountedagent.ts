import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { formatMount, formatMountList, formatUnmounted } from '../formatters.js';
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
  outputSuccess(data.data);
}

export async function mountedAgentShow(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/mountedagents/mine/${encodeURIComponent(slug)}`);
  outputSuccess(data.data);
}

export async function mountedAgentList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/mountedagents/mine');
  outputSuccess(data.data);
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
    scaffoldFiles?: Array<{ path: string; contentUrl: string; assetAlias: string }>;
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
  });
}

export async function mountedAgentMount(
  imprintSlug: string,
  options: { team?: string; name?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { imprintSlug };
  if (options.team) body.teamSlug = options.team;
  if (options.name) body.name = options.name;
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

export async function mountedAgentUnmount(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/mounts/${encodeURIComponent(mountId)}`);
  outputSuccess({ id: mountId, unmounted: true }, formatUnmounted);
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
