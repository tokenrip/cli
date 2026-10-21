import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import { requireAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionCreated } from '../formatters.js';

/**
 * A new version of the artifact's own type (AR-1: no `--type`). A text artifact (markdown, html,
 * csv, …) takes the file's text as `content`; a file artifact takes the file as an upload. The
 * artifact is read first to tell which.
 */
export async function update(
  identifier: string,
  filePath: string,
  options: { description?: string; context?: string; title?: string; alias?: string; expectedVersionId?: string; why?: string; dryRun?: boolean },
): Promise<void> {
  const uuid = parseArtifactId(identifier);
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would update', artifactId: uuid, file: absPath }, formatVersionCreated);
    return;
  }

  const { client } = requireAuthClient();
  const { data: current } = await client.get(`/v0/artifacts/${uuid}`);
  const fileArtifact = current?.data?.type === 'file';

  let result: Record<string, unknown>;
  if (!fileArtifact) {
    // A text artifact: the version is the file's text, of the artifact's own type.
    const content = fs.readFileSync(absPath, 'utf-8');
    const body: Record<string, unknown> = { content };
    if (options.description) body.description = options.description;
    if (options.context) body.creatorContext = options.context;
    if (options.expectedVersionId) body.expectedVersionId = options.expectedVersionId;
    if (options.why !== undefined) body.why = options.why;

    const { data } = await client.post(`/v0/artifacts/${uuid}/versions`, body);
    result = data.data;
  } else {
    // A file artifact: upload the file as it is.
    const form = new FormData();
    form.append('file', fs.createReadStream(absPath));
    if (options.description) form.append('description', options.description);
    if (options.context) form.append('creatorContext', options.context);
    if (options.expectedVersionId) form.append('expectedVersionId', options.expectedVersionId);
    if (options.why !== undefined) form.append('why', options.why);

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
    if (typeof result.workspaceRevision === 'number') patchBody.expectedWorkspaceRevision = result.workspaceRevision;
    if (options.why !== undefined) patchBody.why = options.why;
    const { data: patched } = await client.patch(`/v0/artifacts/${uuid}`, patchBody);
    result = { ...result, title: patched.data.title ?? result.title, alias: patched.data.alias };
  }

  outputSuccess(result, formatVersionCreated);
}
