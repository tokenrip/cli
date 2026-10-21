import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import FormData from 'form-data';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import {
  formatBundleCreated,
  formatBundleList,
  formatBundleDetail,
  formatBundleVersions,
  formatTrashed,
} from '../formatters.js';
import { zipDirectory } from '../zip.js';

interface DeployOptions {
  title?: string;
  slug?: string;
  description?: string;
  bundle?: string;
  visibility?: string;
  entrypoint?: string;
  spa?: boolean;
  dryRun?: boolean;
}

/** What only a new bundle sets: a new version (`--bundle`) keeps the bundle's own. */
const BUNDLE_ONLY_FLAGS = ['title', 'slug', 'visibility'] as const;

export async function bundleDeploy(dir: string, options: DeployOptions): Promise<void> {
  if (options.bundle) {
    const given = BUNDLE_ONLY_FLAGS.filter((flag) => options[flag] !== undefined);
    if (given.length > 0) {
      throw new CliError('INVALID_ARGS', `${given.map((flag) => `--${flag}`).join(', ')} set${given.length === 1 ? 's' : ''} a new bundle; a new version (--bundle) keeps the bundle's own. Change them with the dashboard or PATCH /v0/bundles/:bundleId, or leave them out.`);
    }
  }
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new CliError('DIR_NOT_FOUND', `Directory not found: ${absDir}`);
  }

  const { buffer, entries, entrypoint } = zipDirectory(absDir);
  if (entries.length === 0) {
    throw new CliError('EMPTY_DIR', `No files found in ${absDir}`);
  }
  if (!entrypoint && !options.spa && !options.entrypoint) {
    throw new CliError('NO_ENTRYPOINT', 'No index.html at the bundle root. Add one, pass --entrypoint <file>, or use --spa.');
  }

  // A new bundle is titled after its folder unless --title says otherwise.
  const title = options.bundle ? undefined : options.title || path.basename(absDir);
  const totalBytes = entries.reduce((n, e) => n + e.sizeBytes, 0);

  if (options.dryRun) {
    outputSuccess(
      { dryRun: true, action: options.bundle ? 'would deploy a new version' : 'would deploy', dir: absDir, ...(title !== undefined ? { title } : {}), entrypoint, fileCount: entries.length, sizeBytes: totalBytes },
      formatBundleCreated,
    );
    return;
  }

  const { client } = requireAuthClient();
  const form = new FormData();
  form.append('file', buffer, { filename: 'bundle.zip', contentType: 'application/zip' });
  if (title !== undefined) form.append('title', title);
  if (options.slug) form.append('slug', options.slug);
  if (options.description) form.append('description', options.description);
  if (options.visibility) form.append('visibility', options.visibility);
  // The server takes the path as the archive stores it: `./index.html` is `index.html` there.
  if (options.entrypoint) form.append('entrypoint', options.entrypoint.replace(/^(?:\.\/)+/, ''));
  if (options.spa) form.append('spa', 'true');

  const url = options.bundle ? `/v0/bundles/${encodeURIComponent(options.bundle)}/versions` : '/v0/bundles';
  const { data } = await client.post(url, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  const d = data.data;
  outputSuccess(
    {
      id: d.id,
      slug: d.slug,
      liveUrl: d.liveUrl,
      pageUrl: d.pageUrl,
      title: d.title,
      entrypoint: d.entrypoint,
      fileCount: d.fileCount ?? entries.length,
      versionCount: d.versionCount,
      version: d.version,
      currentVersionId: d.currentVersionId,
    },
    formatBundleCreated,
  );
}

export async function bundleList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/bundles/status');
  outputSuccess(data.data.bundles, formatBundleList);
}

export async function bundleGet(bundleRef: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(bundleRef)}`);
  outputSuccess(data.data, formatBundleDetail);
}

export async function bundleVersions(bundleRef: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(bundleRef)}/versions`);
  outputSuccess(data.data.versions, formatBundleVersions);
}

export async function bundleRollback(bundleRef: string, version: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/bundles/${encodeURIComponent(bundleRef)}/rollback`, { version: Number(version) });
  outputSuccess(
    { id: data.data.id, slug: data.data.slug, liveUrl: data.data.liveUrl, pageUrl: data.data.pageUrl, title: data.data.title, versionCount: data.data.versionCount },
    formatBundleCreated,
  );
}

export async function bundleOpen(bundleRef: string, options: { browser?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(bundleRef)}`);
  const liveUrl: string = data.data.liveUrl;
  if (options.browser && liveUrl) {
    const platform = process.platform;
    let cmd = 'xdg-open';
    let args = [liveUrl];
    if (platform === 'darwin') { cmd = 'open'; args = [liveUrl]; }
    else if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', liveUrl]; }
    try {
      execFile(cmd, args, () => { /* fire-and-forget */ });
    } catch {
      /* swallow — URL is printed below regardless */
    }
  }
  outputSuccess({ liveUrl, pageUrl: data.data.pageUrl }, (raw) => {
    const r = raw as { liveUrl?: string; pageUrl?: string };
    return [r.liveUrl ? `Live: ${r.liveUrl}` : '', r.pageUrl ? `Page: ${r.pageUrl}` : ''].filter(Boolean).join('\n');
  });
}

/** Move a bundle to the trash for 30 days (restorable), as every other delete: no confirmation flag. */
export async function bundleDelete(bundleRef: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.delete(`/v0/bundles/${encodeURIComponent(bundleRef)}`);
  outputSuccess(data.data, formatTrashed);
}
