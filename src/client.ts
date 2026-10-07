import axios, { AxiosInstance, AxiosError, type InternalAxiosRequestConfig, type AxiosResponse, type AxiosAdapter, type CancelToken } from 'axios';
import { CliError, safeErrorDetails, type TransportErrorDetails } from './errors.js';
import { createProxyAgentOwner } from './proxy-agents.js';

const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  apiKey?: string;
}

type RequestObservation = { started: number; timeout: unknown; responseReceived: boolean; httpStatus?: number };

function transportError(error: unknown, observation?: RequestObservation): CliError {
  if (error instanceof CliError) return error;
  const failure = error && typeof error === 'object' ? error as { code?: unknown; cause?: unknown; proxyTunnelTimeout?: unknown; response?: AxiosResponse } : {};
  const nativeTimeout = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const cause = value as { code?: unknown; proxyTunnelTimeout?: unknown };
    return cause.code === 'ERR_PROXY_TUNNEL' && typeof cause.proxyTunnelTimeout === 'number'
      && Number.isFinite(cause.proxyTunnelTimeout) && cause.proxyTunnelTimeout > 0;
  };
  // Axios can wrap one native error. Do not traverse arbitrary cause graphs.
  const causeCode = failure.cause && typeof failure.cause === 'object' ? (failure.cause as { code?: unknown }).code : undefined;
  const timeout = failure.code !== 'ERR_CANCELED' && (failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT'
    || nativeTimeout(failure) || causeCode === 'ECONNABORTED' || causeCode === 'ETIMEDOUT' || nativeTimeout(failure.cause));
  const details: TransportErrorDetails = {
    ...(observation ? { elapsedMs: Math.round(performance.now() - observation.started),
      ...(typeof observation.timeout === 'number' ? { timeoutMs: observation.timeout } : {}),
      responseReceived: observation.responseReceived, httpStatus: observation.httpStatus } : {}),
    ...(typeof failure.code === 'string' ? { transportCode: failure.code } : {}),
    ...(failure.response ? { responseReceived: true, httpStatus: failure.response.status } : {}),
  };
  return new CliError(timeout ? 'TIMEOUT' : 'NETWORK_ERROR',
    `${timeout ? 'Request timed out.' : 'Network request failed.'} Inspect the operation outcome before repeating a write; the server may have committed it.`,
    undefined, details);
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

  const proxyAgents = createProxyAgentOwner(client.defaults.timeout!);
  const observations = new WeakMap<InternalAxiosRequestConfig, RequestObservation>();
  const originalTokens = new WeakMap<InternalAxiosRequestConfig, CancelToken>();
  const restoreToken = (config?: InternalAxiosRequestConfig): void => {
    if (!config) return;
    const original = originalTokens.get(config);
    if (original) { config.cancelToken = original; originalTokens.delete(config); }
  };
  client.interceptors.request.use(config => {
    const transforms = config.transformRequest;
    config.transformRequest = [
      ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : []),
      function (this: InternalAxiosRequestConfig, data) {
        // Serialization can throw an error without config. Allocate transport
        // resources only after the caller's transformations have succeeded.
        const observation: RequestObservation = { started: performance.now(), timeout: this.timeout, responseReceived: false };
        observations.set(this, observation);
        if (this.cancelToken) {
          const original = this.cancelToken;
          const requestConfig = this;
          originalTokens.set(this, original);
          // Axios checks cancellation again after adapter settlement. Attribute
          // that late check locally, while keeping the caller's token untouched.
          this.cancelToken = {
            get promise() { return original.promise; },
            get reason() { return original.reason; },
            throwIfRequested() {
              try { original.throwIfRequested(); }
              catch { throw new axios.CanceledError(undefined, requestConfig); }
            },
            subscribe: listener => original.subscribe(listener),
            unsubscribe: listener => original.unsubscribe(listener),
            toAbortSignal: () => original.toAbortSignal(),
          };
        }
        // Match Axios dispatch's fallback before native transport selection too.
        this.adapter = this.adapter || axios.defaults.adapter;
        proxyAgents.prepare(this);
        // Axios 1.20 accepts config here at runtime, though its declaration omits it.
        // Fetch adapter selection uses the caller's env.fetch/Request/Response.
        const adapter = (axios.getAdapter as (adapters: InternalAxiosRequestConfig['adapter'], config: InternalAxiosRequestConfig) => AxiosAdapter)(this.adapter, this);
        // Capture raw replies and configless rejections at this request's boundary.
        // In particular, CancelToken reasons can be shared and must not be mutated.
        this.adapter = async adapterConfig => {
          try {
            const response = await adapter(adapterConfig);
            observation.responseReceived = true;
            observation.httpStatus = response.status;
            return response;
          } catch (error) {
            proxyAgents.settle(adapterConfig);
            const failure = error as AxiosError & { proxyTunnelTimeout?: unknown };
            if (failure?.response) { observation.responseReceived = true; observation.httpStatus = failure.response.status; }
            if (!failure?.config) {
              // Preserve Axios's cancellation sentinel on a request-local wrapper,
              // so dispatch does not replace our attribution with a shared reason.
              const local = new AxiosError('Transport request failed.', typeof failure?.code === 'string' ? failure.code : undefined, adapterConfig);
              local.cause = (failure?.cause ?? error) as Error;
              if (failure?.code === 'ERR_PROXY_TUNNEL') Object.assign(local, { proxyTunnelTimeout: failure.proxyTunnelTimeout });
              local.response = failure?.response;
              if (axios.isCancel(error)) Object.defineProperty(local, '__CANCEL__', { value: true });
              throw local;
            }
            throw error;
          }
        };
        const transforms = this.transformResponse;
        this.transformResponse = [function (data, headers, status) {
          // Axios exposes its raw response only while these transforms run.
          const rawResponse = (this as InternalAxiosRequestConfig & { response?: AxiosResponse }).response;
          if (rawResponse) { observation.responseReceived = true; observation.httpStatus = rawResponse.status; }
          try {
            for (const transform of Array.isArray(transforms) ? transforms : transforms ? [transforms] : []) {
              data = transform.call(this, data, headers.normalize(false), status);
            }
            headers.normalize(false);
            return data;
          } catch (error) {
            // Caller response transforms may throw plain errors without config.
            proxyAgents.settle(this);
            restoreToken(this);
            throw transportError(error, observation);
          }
        }];
        return data;
      },
    ];
    return config;
  });

  client.interceptors.response.use(
    (response) => { proxyAgents.settle(response.config, response); restoreToken(response.config); return response; },
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
      if (error instanceof CliError) throw error;
      proxyAgents.settle(error.config);
      restoreToken(error.config);
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
      throw transportError(error, error.config ? observations.get(error.config) : undefined);
    },
  );

  return client;
}
