import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import { requireAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionCreated } from '../formatters.js';

interface UpdateOptions {
  description?: string;
  context?: string;
  title?: string;
  alias?: string;
  expectedVersionId?: string;
  keepPrevious?: boolean;
  find?: string[];
  replace?: string[];
  why?: string;
  dryRun?: boolean;
}

/**
 * The edits `--find` / `--replace` name, paired in order (the first find with the first replace).
 * Unequal counts are a usage error, before any request.
 */
export function pairEdits(find: readonly string[] = [], replace: readonly string[] = []): Array<{ find: string; replace: string }> {
  if (find.length !== replace.length) {
    throw new CliError('INVALID_ARGS', `Each --find needs a --replace (they pair in order): got ${find.length} --find and ${replace.length} --replace.`);
  }
  return find.map((text, index) => ({ find: text, replace: replace[index]! }));
}

/**
 * A new version of the artifact's own type (AR-1: no `--type`), from a file or from edits (exactly
 * one). With a file, a text artifact (markdown, html, csv, …) takes the file's text as `content`;
 * a file artifact takes the file as an upload; the artifact is read first to tell which. Edits
 * (`--find` / `--replace` pairs) apply on the server to the current text, sent as JSON with no
 * read first.
 */
export async function update(identifier: string, filePath: string | undefined, options: UpdateOptions): Promise<void> {
  const uuid = parseArtifactId(identifier);
  const edits = pairEdits(options.find, options.replace);
  if (filePath !== undefined && edits.length > 0) {
    throw new CliError('INVALID_ARGS', 'Give a file or --find/--replace edits, not both.');
  }
  if (filePath === undefined && edits.length === 0) {
    throw new CliError('INVALID_ARGS', 'Give the file with the new content, or --find/--replace edits.');
  }
  const absPath = filePath === undefined ? undefined : path.resolve(filePath);
  if (absPath !== undefined && !fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would update', artifactId: uuid, ...(absPath ? { file: absPath } : { edits: edits.length }) }, formatVersionCreated);
    return;
  }

  const { client } = requireAuthClient();
  const fields: Record<string, unknown> = {};
  if (options.description) fields.description = options.description;
  if (options.context) fields.creatorContext = options.context;
  if (options.expectedVersionId) fields.expectedVersionId = options.expectedVersionId;
  if (options.keepPrevious) fields.keepPrevious = true;
  if (options.why !== undefined) fields.why = options.why;

  let result: Record<string, unknown>;
  if (absPath === undefined) {
    // Edits: the server applies them to the current text, so nothing is read first.
    const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, { edits, ...fields });
    result = data.data;
  } else {
    const { data: current } = await client.get(`/v0/artifacts/${uuid}`);
    if (current?.data?.type !== 'file') {
      // A text artifact: the version is the file's text, of the artifact's own type.
      const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, { content: fs.readFileSync(absPath, 'utf-8'), ...fields });
      result = data.data;
    } else {
      // A file artifact: upload the file as it is (a multipart field is text).
      const form = new FormData();
      form.append('file', fs.createReadStream(absPath));
      for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
      const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      result = data.data;
    }
  }

  // Title / alias are artifact-level metadata, not version content — apply them
  // with a follow-up PATCH so a republish-and-retitle is one command (Moa
  // debrief §3.3). The new version is already created above; if the PATCH
  // fails we surface that error but the version persisted.
  if (options.title !== undefined || options.alias !== undefined) {
    const patchBody: Record<string, unknown> = {};
    if (options.title !== undefined) patchBody.title = options.title;
    if (options.alias !== undefined) patchBody.alias = options.alias;
    if (typeof result.workspaceRevision === 'number') patchBody.expectedWorkspaceRevision = result.workspaceRevision;
    if (options.why !== undefined) patchBody.why = options.why;
    const { data: patched } = await client.patch(`/v0/artifacts/${uuid}`, patchBody);
    result = { ...result, title: patched.data.title ?? result.title, alias: patched.data.alias };
  }

  outputSuccess(result, formatVersionCreated);
}
