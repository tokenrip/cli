import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import mime from 'mime-types';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionCreated } from '../formatters.js';

const VALID_TYPES = ['markdown', 'html', 'chart', 'code', 'text', 'json', 'csv'] as const;
type ContentType = (typeof VALID_TYPES)[number];

export async function update(
  uuid: string,
  filePath: string,
  options: { type?: string; description?: string; context?: string; title?: string; alias?: string; dryRun?: boolean },
): Promise<void> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  if (options.type && !VALID_TYPES.includes(options.type as ContentType)) {
    throw new CliError('INVALID_TYPE', `Type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would update', artifactId: uuid, file: absPath }, formatVersionCreated);
    return;
  }

  const { client } = requireAuthClient();

  let result: Record<string, unknown>;
  if (options.type) {
    // Content publish mode
    const content = fs.readFileSync(absPath, 'utf-8');
    const body: Record<string, unknown> = { type: options.type, content };
    if (options.description) body.description = options.description;
    if (options.context) body.creatorContext = options.context;

    const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, body);
    result = data.data;
  } else {
    // File upload mode
    const form = new FormData();
    form.append('file', fs.createReadStream(absPath));
    if (options.description) form.append('description', options.description);
    if (options.context) form.append('creatorContext', options.context);

    const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    result = data.data;
  }

  // Title / alias are artifact-level metadata, not version content — apply them
  // with a follow-up PATCH so a republish-and-retitle is one command (Moa
  // debrief §3.3). The new version is already created above; if the PATCH
  // fails we surface that error but the version persisted.
  if (options.title !== undefined || options.alias !== undefined) {
    const patchBody: Record<string, unknown> = {};
    if (options.title !== undefined) patchBody.title = options.title;
    if (options.alias !== undefined) patchBody.alias = options.alias;
    const { data: patched } = await client.patch(`/v0/artifacts/${uuid}`, patchBody);
    result = { ...result, title: patched.data.title ?? result.title, alias: patched.data.alias };
  }

  outputSuccess(result, formatVersionCreated);
}
