import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import mime from 'mime-types';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAssetCreated } from '../formatters.js';

export async function upload(filePath: string, options: { title?: string; parent?: string; context?: string; refs?: string; dryRun?: boolean }): Promise<void> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  const mimeType = mime.lookup(absPath) || 'application/octet-stream';
  const title = options.title || path.basename(absPath);
  const size = fs.statSync(absPath).size;

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would upload', file: absPath, title, mimeType, size }, formatAssetCreated);
    return;
  }

  const { client } = requireAuthClient();

  const form = new FormData();
  form.append('file', fs.createReadStream(absPath));
  form.append('type', 'file');
  form.append('mimeType', mimeType);
  form.append('title', title);

  if (options.parent) form.append('parentAssetId', options.parent);
  if (options.context) form.append('creatorContext', options.context);
  if (options.refs) form.append('inputReferences', JSON.stringify(options.refs.split(',').map((r) => r.trim())));

  const { data } = await client.post('/v0/assets', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const url = data.data.url || `https://tokenrip.com/s/${data.data.id}`;
  outputSuccess({
    id: data.data.id,
    url,
    title: data.data.title,
    type: data.data.type,
    mimeType: data.data.mimeType,
  }, formatAssetCreated);
}
