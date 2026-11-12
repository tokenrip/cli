import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatMessage, formatMessagePage } from '../formatters.js';

/**
 * `rip message post|read|update|delete` (workspace threads plan M8) over `/v0/messages`: a message
 * in a workspace's chat (`--workspace-id`, read by every member, guests included) or in a task's thread
 * (`--task-id`). A message takes no why (it is its own reason), so no command here takes `--why` and
 * none sends one.
 */

export interface MessageThreadOptions {
  /** `--workspace-id`: the workspace whose chat this is, by id or slug. */
  workspaceId?: string;
  /** `--task-id`: the task whose thread this is. */
  taskId?: string;
}

export interface MessageTextOptions {
  /** Read the text verbatim from this file instead of the argument. */
  file?: string;
}

/** The thread, named once: `--workspace-id` or `--task-id`, exactly one, checked before any request. */
function threadOf(options: MessageThreadOptions): { workspaceId: string } | { taskId: string } {
  if ((options.workspaceId === undefined) === (options.taskId === undefined)) {
    throw new CliError('INVALID_ARGS', 'Name one thread: --workspace-id <id|slug> for the workspace chat, or --task-id <id> for a task\'s thread.');
  }
  return options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : { taskId: options.taskId! };
}

/** The text: the argument or `--file`, exactly one, checked before any request. A file is read verbatim. */
function textOf(inline: string | undefined, options: MessageTextOptions): string {
  if (inline !== undefined && options.file !== undefined) throw new CliError('INVALID_ARGS', 'Give the text or --file, not both.');
  if (options.file === undefined) {
    if (inline === undefined) throw new CliError('INVALID_ARGS', 'Give the message text, or --file with it.');
    return inline;
  }
  const absPath = path.resolve(options.file);
  if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  return fs.readFileSync(absPath, 'utf-8');
}

const messagePath = (id?: string) => (id ? `/v0/messages/${encodeURIComponent(id)}` : '/v0/messages');

export async function messagePost(text: string | undefined, options: MessageThreadOptions & MessageTextOptions): Promise<void> {
  const thread = threadOf(options);
  const body = textOf(text, options);
  const { client } = requireAuthClient();
  const { data } = await client.post(messagePath(), { ...thread, body });
  outputSuccess(data.data, formatMessage);
}

export async function messageRead(options: MessageThreadOptions & { limit?: string; cursor?: string }): Promise<void> {
  const params: Record<string, string> = { ...threadOf(options) };
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.cursor !== undefined) params.cursor = options.cursor;
  const { client } = requireAuthClient();
  const { data } = await client.get(messagePath(), { params });
  outputSuccess(data.data, formatMessagePage);
}

export async function messageUpdate(id: string, text: string | undefined, options: MessageTextOptions): Promise<void> {
  const body = textOf(text, options);
  const { client } = requireAuthClient();
  const { data } = await client.patch(messagePath(id), { body });
  outputSuccess(data.data, formatMessage);
}

export async function messageDelete(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.delete(messagePath(id));
  outputSuccess(data.data, formatMessage);
}
