import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';

export async function adminMountedAgentList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/admin/mountedagents');
  outputSuccess(data.data);
}

export async function adminMountedAgentShow(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/admin/mountedagents/${encodeURIComponent(slug)}`);
  outputSuccess(data.data);
}

export async function adminMountedAgentUnpublish(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/admin/mountedagents/${encodeURIComponent(slug)}`, {
    isPublished: false,
  });
  outputSuccess(data.data);
}

export async function adminMountedAgentSetFeatured(slug: string, weightArg: string): Promise<void> {
  let weight: number | null;
  if (weightArg === 'clear' || weightArg === 'null') {
    weight = null;
  } else {
    weight = Number.parseInt(weightArg, 10);
    if (!Number.isFinite(weight)) {
      throw new CliError('INVALID_FEATURED', 'Weight must be an integer or "clear"');
    }
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(`/v0/admin/mountedagents/${encodeURIComponent(slug)}`, {
    isFeatured: weight,
  });
  outputSuccess(data.data);
}

export async function adminMountedAgentSessions(slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/admin/mountedagents/${encodeURIComponent(slug)}/sessions`,
  );
  outputSuccess(data.data);
}
