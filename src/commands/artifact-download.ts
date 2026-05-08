import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import { optionalAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatArtifactDownloaded } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function artifactDownload(
  input: string,
  options: { output?: string; version?: string; format?: string },
): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();

  const { data: artifactRes } = await client.get(`/v0/artifacts/${uuid}`);
  const artifact = artifactRes.data;

  if (artifact.type !== 'collection') {
    const endpoint = options.version
      ? `/v0/artifacts/${uuid}/versions/${options.version}/content`
      : `/v0/artifacts/${uuid}/content`;

    const response = await client.get(endpoint, { responseType: 'arraybuffer' });

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const ext = mime.extension(contentType) || 'bin';
    const outPath = path.resolve(options.output || `${uuid}.${ext}`);

    fs.writeFileSync(outPath, Buffer.from(response.data));

    outputSuccess(
      { file: outPath, sizeBytes: response.data.byteLength, mimeType: contentType },
      formatArtifactDownloaded,
    );
    return;
  }

  const format = options.format || 'csv';
  if (format !== 'csv' && format !== 'json') {
    throw new CliError('INVALID_FORMAT', `Invalid format "${format}". Use csv or json.`);
  }

  const schema: Array<{ name: string; position: number }> = artifact.metadata?.schema ?? [];

  let allRows: Array<{ data: Record<string, unknown> }> = [];
  let cursor: string | undefined;
  do {
    const params: Record<string, string> = { limit: '500' };
    if (cursor) params.after = cursor;
    const { data } = await client.get(`/v0/artifacts/${uuid}/rows`, { params });
    allRows.push(...data.data.rows);
    cursor = data.data.nextCursor ?? undefined;
  } while (cursor);

  let content: string;
  let mimeType: string;
  let ext: string;

  if (format === 'json') {
    content = JSON.stringify(allRows.map((r) => r.data), null, 2);
    mimeType = 'application/json';
    ext = 'json';
  } else {
    const headers = schema.sort((a, b) => a.position - b.position).map((c) => c.name);
    const csvRows = [
      headers.map(csvEscape).join(','),
      ...allRows.map((r) => headers.map((h) => csvEscape(String(r.data[h] ?? ''))).join(',')),
    ];
    content = csvRows.join('\n');
    mimeType = 'text/csv';
    ext = 'csv';
  }

  const filename = artifact.title || uuid;
  const outPath = path.resolve(options.output || `${filename}.${ext}`);
  fs.writeFileSync(outPath, content, 'utf-8');

  outputSuccess(
    { file: outPath, sizeBytes: Buffer.byteLength(content, 'utf-8'), mimeType },
    formatArtifactDownloaded,
  );
}
