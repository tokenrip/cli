export type Formatter = (data: Record<string, unknown>) => string;

export const formatAssetCreated: Formatter = (data) => {
  const lines = [`Created: ${data.title || '(untitled)'}`];
  if (data.id) lines.push(`  ID:   ${data.id}`);
  if (data.url) lines.push(`  URL:  ${data.url}`);
  if (data.type) lines.push(`  Type: ${data.type}`);
  if (data.mimeType) lines.push(`  MIME: ${data.mimeType}`);
  return lines.join('\n');
};

export const formatAssetDeleted: Formatter = (data) => {
  return `Deleted: ${data.id}`;
};

export const formatAssetList: Formatter = (data) => {
  const assets = data as unknown as Record<string, unknown>[];
  if (!Array.isArray(assets) || assets.length === 0) {
    return 'No assets found.';
  }
  const lines = [`${assets.length} asset(s):\n`];
  for (const a of assets) {
    const title = a.title || '(untitled)';
    const type = a.type || '';
    const id = a.id || '';
    lines.push(`  ${type.toString().padEnd(10)} ${title}  (${id})`);
  }
  return lines.join('\n');
};

export const formatStats: Formatter = (data) => {
  const lines: string[] = [];
  if (data.totalCount !== undefined) lines.push(`Total assets: ${data.totalCount}`);
  if (data.totalBytes !== undefined) lines.push(`Total size:   ${formatBytes(data.totalBytes as number)}`);
  const byType = data.byType as Record<string, unknown>[] | undefined;
  if (Array.isArray(byType) && byType.length > 0) {
    lines.push('');
    lines.push('By type:');
    for (const t of byType) {
      const name = (t.type || 'unknown') as string;
      const count = t.count ?? 0;
      const bytes = t.totalBytes ?? 0;
      lines.push(`  ${name.padEnd(10)} ${String(count).padStart(4)} assets  ${formatBytes(bytes as number)}`);
    }
  }
  return lines.join('\n');
};

export const formatVersionCreated: Formatter = (data) => {
  const lines = [`Version ${data.version || '?'} published`];
  if (data.id) lines.push(`  Version ID: ${data.id}`);
  if (data.assetId) lines.push(`  Asset ID:   ${data.assetId}`);
  if (data.label) lines.push(`  Label:      ${data.label}`);
  return lines.join('\n');
};

export const formatVersionDeleted: Formatter = (data) => {
  return `Deleted version ${data.versionId} from asset ${data.assetId}`;
};

export const formatConfigSaved: Formatter = (data) => {
  return data.message as string || 'Configuration saved.';
};

export const formatAuthKey: Formatter = (data) => {
  const lines = [data.message as string || 'API key created.'];
  if (data.keyName) lines.push(`  Name: ${data.keyName}`);
  if (data.apiKey) lines.push(`  Key:  ${data.apiKey}`);
  if (data.note) lines.push(`  ${data.note}`);
  return lines.join('\n');
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
