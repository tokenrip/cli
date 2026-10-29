import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatComment } from '../formatters.js';

/**
 * `rip comment add|update|delete` (task rounds design §5.7): comments on a task, over
 * `/v0/comments`. Every comment command lives under `comment`, so a later subject (a file) adds its
 * own flag beside `--task`.
 */

export interface CommentTextOptions {
  /** Read the text verbatim from this file instead of the argument. */
  file?: string;
  why?: string;
}

function attribution(options: { why?: string }): Record<string, string> {
  return options.why !== undefined ? { why: options.why } : {};
}

/** The text: the argument or `--file`, exactly one, checked before any request. A file is read verbatim. */
function textOf(inline: string | undefined, options: CommentTextOptions): string {
  if (inline !== undefined && options.file !== undefined) throw new CliError('INVALID_ARGS', 'Give the text or --file, not both.');
  if (options.file === undefined) {
    if (inline === undefined) throw new CliError('INVALID_ARGS', 'Give the comment text, or --file with it.');
    return inline;
  }
  const absPath = path.resolve(options.file);
  if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  return fs.readFileSync(absPath, 'utf-8');
}

const commentPath = (id?: string) => (id ? `/v0/comments/${encodeURIComponent(id)}` : '/v0/comments');

export async function commentAdd(text: string | undefined, options: CommentTextOptions & { task: string }): Promise<void> {
  const body = textOf(text, options);
  const { client } = requireAuthClient();
  const { data } = await client.post(commentPath(), { taskId: options.task, body, ...attribution(options) });
  outputSuccess(data.data, formatComment);
}

export async function commentUpdate(id: string, text: string | undefined, options: CommentTextOptions): Promise<void> {
  const body = textOf(text, options);
  const { client } = requireAuthClient();
  const { data } = await client.patch(commentPath(id), { body, ...attribution(options) });
  outputSuccess(data.data, formatComment);
}

export async function commentDelete(id: string, options: { why?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const body = attribution(options);
  const { data } = await client.delete(commentPath(id), Object.keys(body).length ? { data: body } : {});
  outputSuccess(data.data, formatComment);
}
