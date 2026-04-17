import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAssetCreated } from '../formatters.js';
import { parseJsonOption } from '../json.js';
import { getFrontendUrl } from '../config.js';

const VALID_TYPES = ['markdown', 'html', 'chart', 'code', 'text', 'json', 'collection', 'csv'] as const;
type ContentType = (typeof VALID_TYPES)[number];

export async function publish(
  filePath: string,
  options: {
    type: string;
    title?: string;
    parent?: string;
    context?: string;
    refs?: string;
    schema?: string;
    alias?: string;
    headers?: boolean;
    fromCsv?: boolean;
    dryRun?: boolean;
  },
): Promise<void> {
  if (!VALID_TYPES.includes(options.type as ContentType)) {
    throw new CliError('INVALID_TYPE', `Type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Collection → CSV import path: single-command creation of a collection from a CSV file
  if (options.type === 'collection' && options.fromCsv) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8');
    const title = options.title || path.basename(absPath, path.extname(absPath));

    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create collection from csv', title, rows: content.split('\n').length }, formatAssetCreated);
      return;
    }

    const body: Record<string, unknown> = {
      type: 'collection',
      from_csv: true,
      content,
      title,
    };
    if (options.headers) body.headers = true;
    if (options.schema) body.schema = parseJsonOption(options.schema, '--schema');
    if (options.alias) body.alias = options.alias;
    if (options.parent) body.parentAssetId = options.parent;
    if (options.context) body.creatorContext = options.context;
    if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());

    const { client, config } = requireAuthClient();
    const { data } = await client.post('/v0/assets', body);
    const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
    outputSuccess({ id: data.data.id, url, title: data.data.title, type: data.data.type }, formatAssetCreated);
    return;
  }

  // Collection schema-only path
  if (options.type === 'collection') {
    let schema: unknown;
    if (options.schema) {
      schema = parseJsonOption(options.schema, '--schema');
    } else {
      const absPath = path.resolve(filePath);
      if (!fs.existsSync(absPath)) {
        throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
      }
      schema = parseJsonOption(fs.readFileSync(absPath, 'utf-8'), filePath);
    }

    const title = options.title || 'Untitled Collection';

    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create collection', title, schema }, formatAssetCreated);
      return;
    }

    const { client, config } = requireAuthClient();
    const body: Record<string, unknown> = { type: 'collection', title, schema };
    if (options.alias) body.alias = options.alias;
    if (options.parent) body.parentAssetId = options.parent;
    if (options.context) body.creatorContext = options.context;
    if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());

    const { data } = await client.post('/v0/assets', body);
    const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
    outputSuccess({ id: data.data.id, url, title: data.data.title, type: data.data.type }, formatAssetCreated);
    return;
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

  const { client, config } = requireAuthClient();
  const content = fs.readFileSync(absPath, 'utf-8');

  const body: Record<string, unknown> = {
    type: options.type,
    content,
    title,
  };
  if (options.alias) body.alias = options.alias;
  if (options.parent) body.parentAssetId = options.parent;
  if (options.context) body.creatorContext = options.context;
  if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());

  const { data } = await client.post('/v0/assets', body);

  const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
  outputSuccess({
    id: data.data.id,
    url,
    title: data.data.title,
    type: data.data.type,
  }, formatAssetCreated);
}
