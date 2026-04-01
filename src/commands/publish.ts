import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAssetCreated } from '../formatters.js';

const VALID_TYPES = ['markdown', 'html', 'chart', 'code', 'text', 'json'] as const;
type ContentType = (typeof VALID_TYPES)[number];

export async function publish(
  filePath: string,
  options: { type: string; title?: string; parent?: string; context?: string; refs?: string; dryRun?: boolean },
): Promise<void> {
  if (!VALID_TYPES.includes(options.type as ContentType)) {
    throw new CliError('INVALID_TYPE', `Type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  const title = options.title || path.basename(absPath);
  const size = fs.statSync(absPath).size;

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would publish', file: absPath, title, type: options.type, size }, formatAssetCreated);
    return;
  }

  const { client } = requireAuthClient();
  const content = fs.readFileSync(absPath, 'utf-8');

  const body: Record<string, unknown> = {
    type: options.type,
    content,
    title,
  };
  if (options.parent) body.parentAssetId = options.parent;
  if (options.context) body.creatorContext = options.context;
  if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());

  const { data } = await client.post('/v0/assets', body);

  const url = data.data.url || `https://tokenrip.com/s/${data.data.id}`;
  outputSuccess({
    id: data.data.id,
    url,
    title: data.data.title,
    type: data.data.type,
  }, formatAssetCreated);
}
