// Matches /s/<id> in a URL. For scoped aliases (e.g. /s/~alice/dashboard or /s/_team/report),
// we capture the prefix + slash + alias as a single identifier.
const ASSET_URL_RE = /\/s\/((?:[~_][^/?#\s]+\/)?[^/?#\s]+)/i;

export function parseAssetId(input: string): string {
  const match = input.match(ASSET_URL_RE);
  if (match) return match[1];
  return input;
}
