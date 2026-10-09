import { CliError } from './errors.js';

export function parseNonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CliError('INVALID_ARGUMENT', `${option} must be a non-negative integer`);
  }
  return parsed;
}

/** Parse a relative duration (`30s`, `5m`, `1h`, `7d`) into an absolute Unix timestamp in seconds. */
export function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new CliError('INVALID_DURATION', `Invalid duration: ${s}. Use e.g. 1h, 7d, 30m`);
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Math.floor(Date.now() / 1000) + n * multipliers[unit];
}

/** Validate supplied create scope before dry runs, filesystem reads or routing. */
export function assertWorkspaceCreationScope(input: { workspaceId?: string; audience?: string; visibility?: string; team?: string; folder?: string; publicAsset?: boolean; handoff?: boolean }): void {
  if (!input.workspaceId && (input.audience !== undefined || input.handoff)) {
    throw new CliError('INVALID_SCOPE', 'Workspace-only fields require --workspace-id (or --workspace for folders). Supply the workspace identity or omit those fields.', { field: 'workspaceId' });
  }
  if (input.workspaceId) {
    const fields = (['visibility', 'team', 'folder'] as const).filter(field => input[field] !== undefined);
    if (fields.length) throw new CliError('WORKSPACE_AUTHORITY', 'Omit standalone sharing fields for workspace content. Use workspace membership and item audience to share it.', { fields });
    if (input.publicAsset) throw new CliError('INELIGIBLE_STORAGE', 'Workspace content cannot use independently public storage. Omit --public-asset.', { fields: ['publicAsset'] });
  }
}
