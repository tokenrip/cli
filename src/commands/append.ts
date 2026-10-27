import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionCreated } from '../formatters.js';

interface AppendOptions {
  expectedVersionId?: string;
  why?: string;
}

/** The text to append: the file's, else stdin's (piped), verbatim. */
function readText(filePath: string | undefined): string {
  if (filePath !== undefined) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
    return fs.readFileSync(absPath, 'utf-8');
  }
  if (process.stdin.isTTY) throw new CliError('INVALID_ARGS', 'Give the file with the text to append, or pipe the text on stdin.');
  return fs.readFileSync(0, 'utf-8');
}

/**
 * `rip artifact append <artifact> [file]` (`POST /v0/artifacts/:artifactId/append`): the text goes
 * at the end of a text artifact on the server, on a new line when the file does not end with one.
 * Nothing is read first, and no `--expected-version-id` is needed (checked when sent).
 */
export async function append(identifier: string, filePath: string | undefined, options: AppendOptions): Promise<void> {
  const uuid = parseArtifactId(identifier);
  const text = readText(filePath);
  if (text.length === 0) throw new CliError('INVALID_ARGS', 'Nothing to append: the text is empty.');

  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { text };
  if (options.expectedVersionId) body.expectedVersionId = options.expectedVersionId;
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.post(`/v0/artifacts/${uuid}/append`, body);
  outputSuccess(data.data, formatVersionCreated);
}
