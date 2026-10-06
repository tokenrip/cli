import axios, { AxiosInstance, AxiosError } from 'axios';
import { CliError, safeErrorDetails } from './errors.js';

const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  apiKey?: string;
}

/**
 * Slugify the harness name the CLI advertises on every request. Mirrors the
 * backend's `normalizeSurface` (apps/backend/src/api/auth/auth.guard.ts) so a
 * value that survives here survives there unchanged.
 */
function normalizeSurface(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return s.length > 0 ? s : null;
}

/**
 * The harness name this process reports. The backend records it on task claims
 * (`claimed_via`) and agent sessions (`surface`).
 *
 * An explicit `TOKENRIP_SURFACE` wins; otherwise Claude Code names itself (it
 * exports `CLAUDECODE=1` into every tool shell) and anything else is plain
 * `cli`. The fallback is applied *after* normalization, so an empty or
 * unslugifiable `TOKENRIP_SURFACE` still yields a surface instead of silently
 * dropping attribution.
 */
export function resolveSurface(env: Record<string, string | undefined> = process.env): string {
  return normalizeSurface(env.TOKENRIP_SURFACE ?? '') ?? (env.CLAUDECODE ? 'claude-code' : 'cli');
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const baseUrl = config.baseUrl || 'https://api.tokenrip.com';
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  headers['X-Tokenrip-Surface'] = resolveSurface();

  const client = axios.create({
    baseURL: baseUrl,
    timeout: config.timeout || DEFAULT_TIMEOUT,
    headers,
  });

  client.interceptors.response.use(
    (response) => response,
    (
      error: AxiosError<{
        ok: boolean;
        error?: string;
        message?: string;
        details?: unknown;
        field?: unknown;
        fields?: unknown;
        status?: unknown;
        currentVersionId?: unknown;
        currentRevision?: unknown;
        currentWorkspaceRevision?: unknown;
        reason?: unknown;
        errors?: Array<{ code?: string; message?: string }>;
      }>,
    ) => {
      if (error.response?.data) {
        const raw: unknown = error.response.data;
        if (raw instanceof ArrayBuffer || Buffer.isBuffer(raw)) {
          try {
            const text = new TextDecoder().decode(raw as ArrayBuffer);
            error.response.data = JSON.parse(text);
          } catch { /* not JSON, leave as-is */ }
        }
      }
      // A 401 carrying its own code (a sign-in route's INVALID_CODE) keeps it. A rejected key, coded
      // or bodiless, says how to get a new one; under TOKENRIP_API_KEY that variable's key is the one
      // refused, and signing in again would not change it.
      if (error.response?.status === 401 && (!error.response.data?.error || error.response.data.error === 'UNAUTHORIZED')) {
        throw new CliError('UNAUTHORIZED', process.env.TOKENRIP_API_KEY
          ? 'The key in TOKENRIP_API_KEY was refused. Replace it, or unset it to use your stored sign-in (rip auth login --email <your email>).'
          : 'This key is not valid. Sign in again: rip auth login --email <your email>');
      }
      if (error.response?.data?.error) {
        const data = error.response.data;
        const errorCode = data.error ?? 'API_ERROR';
        let message = data.message || 'Unknown API error';
        const fieldLines: string[] = [];
        const safeDetails = safeErrorDetails(errorCode, Array.isArray(data.details) ? data.details : {
          ...(data.details && typeof data.details === 'object' ? data.details : {}),
          ...Object.fromEntries(['field', 'fields', 'status', 'currentVersionId', 'currentRevision', 'currentWorkspaceRevision', 'reason']
            .filter(field => data[field as keyof typeof data] !== undefined).map(field => [field, data[field as keyof typeof data]])),
        });
        for (const issue of Array.isArray(safeDetails) ? safeDetails : []) {
          const path = (issue.path ?? []).join('.');
          fieldLines.push(`  ${path || '(root)'}: ${issue.message ?? 'invalid'}`);
        }
        for (const issue of Array.isArray(data.errors) ? data.errors : []) {
          fieldLines.push(`  ${issue.code ?? 'error'}: ${issue.message ?? 'invalid'}`);
        }
        if (fieldLines.length > 0) {
          message += `\n${fieldLines.join('\n')}`;
        }
        throw new CliError(errorCode, message, safeDetails);
      }
      if (error.response?.status === 413) {
        throw new CliError('PAYLOAD_TOO_LARGE', `Payload too large — the server rejected the request body. Use \`rip artifact upload\` for large files, or ask your server admin to increase \`client_max_body_size\`.`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new CliError('TIMEOUT', `Request timeout while contacting ${baseUrl}. Inspect the operation outcome before repeating a write; the server may have committed it.`);
      }
      const status = error.response?.status;
      const details = error.code || error.message || 'Unknown error';
      const statusInfo = status ? ` (HTTP ${status})` : '';
      throw new CliError('NETWORK_ERROR', `Network error (${details}${statusInfo}) while contacting ${baseUrl}`);
    },
  );

  return client;
}
