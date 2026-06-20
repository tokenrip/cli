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

export async function bundleDeploy(dir: string, options: DeployOptions): Promise<void> {
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

  const title = options.title || path.basename(absDir);
  const totalBytes = entries.reduce((n, e) => n + e.sizeBytes, 0);

  if (options.dryRun) {
    outputSuccess(
      { dryRun: true, action: 'would deploy', dir: absDir, title, entrypoint, fileCount: entries.length, sizeBytes: totalBytes },
      formatBundleCreated,
    );
    return;
  }

  const { client } = requireAuthClient();
  const form = new FormData();
  form.append('file', buffer, { filename: 'bundle.zip', contentType: 'application/zip' });
  form.append('title', title);
  if (options.slug) form.append('slug', options.slug);
  if (options.description) form.append('description', options.description);
  if (options.visibility) form.append('visibility', options.visibility);
  if (options.entrypoint) form.append('entrypoint', options.entrypoint);
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

export async function bundleList(options: { archived?: boolean; includeArchived?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (options.archived) params.archived = 'true';
  if (options.includeArchived) params.include_archived = 'true';
  const { data } = await client.get('/v0/bundles/status', { params });
  outputSuccess(data.data.bundles, formatBundleList);
}

export async function bundleGet(idOrSlug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(idOrSlug)}`);
  outputSuccess(data.data, formatBundleDetail);
}

export async function bundleVersions(idOrSlug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(idOrSlug)}/versions`);
  outputSuccess(data.data.versions, formatBundleVersions);
}

export async function bundleRollback(idOrSlug: string, version: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/bundles/${encodeURIComponent(idOrSlug)}/rollback`, { version: Number(version) });
  outputSuccess(
    { id: data.data.id, slug: data.data.slug, liveUrl: data.data.liveUrl, pageUrl: data.data.pageUrl, title: data.data.title, versionCount: data.data.versionCount },
    formatBundleCreated,
  );
}

export async function bundleOpen(idOrSlug: string, options: { browser?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/bundles/${encodeURIComponent(idOrSlug)}`);
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

export async function bundleDelete(idOrSlug: string, options: { yes?: boolean }): Promise<void> {
  if (!options.yes) {
    throw new CliError('CONFIRM_REQUIRED', `This permanently deletes the bundle and all its versions. Re-run with --yes to confirm.`);
  }
  const { client } = requireAuthClient();
  await client.delete(`/v0/bundles/${encodeURIComponent(idOrSlug)}`);
  outputSuccess({ deleted: idOrSlug }, (raw) => `Deleted: ${(raw as { deleted: string }).deleted}`);
}
