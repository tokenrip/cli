import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';

export async function mountedAgentPublish(
  manifestPath: string,
  options: { published?: boolean; featured?: string; team?: string },
): Promise<void> {
  const manifest = readManifest(manifestPath);
  const body: Record<string, unknown> = { manifest };
  if (options.published) body.isPublished = true;
  if (options.featured !== undefined) {
    const parsed = Number.parseInt(options.featured, 10);
    if (!Number.isFinite(parsed)) {
      throw new CliError('INVALID_FEATURED', '--featured must be an integer');
    }
    body.isFeatured = parsed;
  }
  if (options.team) body.publisherTeamId = options.team;

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
  if (!options.team) {
    throw new CliError('TEAM_REQUIRED', '--team is required for mounted agent forks');
  }

  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/mountedagents/fork', {
    templateSlug,
    teamSlug: options.team,
    ...(options.slug ? { newSlug: options.slug } : {}),
  });
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
