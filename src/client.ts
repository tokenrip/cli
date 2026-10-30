import { Stream } from 'node:stream';
import axios, { AxiosInstance, AxiosError, AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig, type AxiosResponse, type AxiosAdapter, type CancelToken } from 'axios';
import { CliError, safeErrorDetails, type TransportErrorDetails } from './errors.js';
import { createProxyAgentOwner } from './proxy-agents.js';
import { CLI_VERSION } from './version.js';

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
 * The harness name this process reports. The backend records it on task holds
 * (`holder_surface`) and agent sessions (`surface`).
 *
 * An explicit `TOKENRIP_SURFACE` wins; otherwise Claude Code names itself (it
 * exports `CLAUDECODE=1` into every tool shell), then Codex (it exports
 * `CODEX_THREAD_ID` into every tool shell), and anything else is plain `cli`.
 * The fallback is applied *after* normalization, so an empty or unslugifiable
 * `TOKENRIP_SURFACE` still yields a surface instead of silently dropping
 * attribution.
 */
export function resolveSurface(env: Record<string, string | undefined> = process.env): string {
  return normalizeSurface(env.TOKENRIP_SURFACE ?? '')
    ?? (env.CLAUDECODE ? 'claude-code' : env.CODEX_THREAD_ID ? 'codex' : 'cli');
}

const CONVERSATION_MAX_CHARS = 256;

/**
 * The harness conversation this process belongs to, sent as
 * `X-Tokenrip-Conversation` so the server can group one sitting's writes (it
 * stores only a hash). An explicit `TOKENRIP_CONVERSATION` wins, then Claude
 * Code's `CLAUDE_CODE_SESSION_ID`, then Codex's `CODEX_THREAD_ID`. A value that is
 * blank, over 256 characters, or one an HTTP header cannot carry counts as unset
 * and the next one is tried: attribution is best effort and must never fail a
 * request.
 */
export function resolveConversation(env: Record<string, string | undefined> = process.env): string | undefined {
  return [env.TOKENRIP_CONVERSATION, env.CLAUDE_CODE_SESSION_ID, env.CODEX_THREAD_ID]
    .map(candidate => candidate?.trim())
    .find(candidate => !!candidate && candidate.length <= CONVERSATION_MAX_CHARS && /^[\x20-\x7e]+$/.test(candidate));
}

/** The longest single `Retry-After` the client waits out (plan D3). */
export const MAINTENANCE_MAX_WAIT_MS = 60_000;
/**
 * The most one request waits for maintenance in all, below agent harnesses' 2-minute tool limit.
 * It covers waiting only: the final resend still has its own request timeout.
 */
export const MAINTENANCE_WAIT_CAP_MS = 90_000;
/** The most times one request is sent again, which bounds a run of `Retry-After: 0`. */
export const MAINTENANCE_MAX_RETRIES = 5;

/**
 * Whether a request refused with `MAINTENANCE` is sent again, and after how long. A refused
 * request did no work, so sending it again is safe, unless its body was a stream already read.
 */
export function maintenanceRetry(input: {
  retryAfterSeconds: number | undefined; waitedMs: number; attempts: number; streamBody: boolean;
}): { waitMs: number } | null {
  const { retryAfterSeconds, waitedMs, attempts, streamBody } = input;
  if (streamBody || attempts >= MAINTENANCE_MAX_RETRIES) return null;
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) return null;
  const waitMs = retryAfterSeconds * 1000;
  if (waitMs > MAINTENANCE_MAX_WAIT_MS || waitedMs + waitMs > MAINTENANCE_WAIT_CAP_MS) return null;
  return { waitMs };
}

/**
 * A resent request's maintenance tally rides on the config it is resent with: Axios's config merge
 * copies symbol-keyed values, and the request interceptor moves it into the client's own map.
 */
const MAINTENANCE_TALLY = Symbol('tokenrip.maintenanceTally');
type MaintenanceTally = { waitedMs: number; attempts: number };
/** What one dispatch needs to be sent again: the request as the interceptor received it, and its tally. */
type Resend = MaintenanceTally & { config: AxiosRequestConfig };

/**
 * Wait out a pause, ending early when the caller cancels (its `signal` or `cancelToken`). The
 * resend that follows a cancel is refused by Axios before anything is sent, so the caller gets
 * exactly the error any cancelled request gets.
 */
function maintenanceWait(ms: number, config: AxiosRequestConfig): Promise<void> {
  return new Promise(resolve => {
    const { signal, cancelToken } = config;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', done);
      cancelToken?.unsubscribe(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    if (signal?.aborted) return done();
    signal?.addEventListener?.('abort', done);
    // A token cancelled already calls its listener at once.
    cancelToken?.subscribe(done);
  });
}

function maintenanceWaitLine(until: string | undefined, seconds: number): string {
  const end = until ? new Date(until) : undefined;
  const at = end && !Number.isNaN(end.getTime())
    ? ` until ${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')} UTC` : '';
  return `Tokenrip is paused for maintenance${at} — waiting ${seconds} s, then retrying.`;
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const baseUrl = config.baseUrl || 'https://api.tokenrip.com';
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  headers['User-Agent'] = `tokenrip-cli/${CLI_VERSION}`;
  headers['X-Tokenrip-Surface'] = resolveSurface();
  const conversation = resolveConversation();
  if (conversation) headers['X-Tokenrip-Conversation'] = conversation;

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
  const resends = new WeakMap<InternalAxiosRequestConfig, Resend>();
  client.interceptors.request.use(config => {
    // Snapshot the request before this client wraps its transforms, adapter, agents and cancel
    // token, so a maintenance resend starts from the caller's request with fresh bookkeeping.
    const tagged = config as { [MAINTENANCE_TALLY]?: MaintenanceTally };
    const carried = tagged[MAINTENANCE_TALLY];
    delete tagged[MAINTENANCE_TALLY];
    const resend: Resend = {
      config: { ...config, headers: new AxiosHeaders(config.headers) },
      waitedMs: carried?.waitedMs ?? 0,
      attempts: carried?.attempts ?? 0,
    };
    const transforms = config.transformRequest;
    config.transformRequest = [
      ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : []),
      function (this: InternalAxiosRequestConfig, data) {
        // Serialization can throw an error without config. Allocate transport
        // resources only after the caller's transformations have succeeded.
        const observation: RequestObservation = { started: performance.now(), timeout: this.timeout, responseReceived: false };
        observations.set(this, observation);
        resends.set(this, resend);
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
    async (
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
        /** `TASK_TAKEN`: who holds the task. */
        holder?: unknown;
        /** `REVIEW_NOT_YOURS` / `INVALID_REVIEWER`: whom the review is addressed to. */
        reviewer?: unknown;
        /** `TASK_NOT_IN_REVIEW`: the latest round and how it ended. */
        latestRound?: unknown;
        /** An input refusal's place, valid columns and CSV header (`INVALID_FIELD`, the row-query and CSV codes). */
        path?: unknown;
        available?: unknown;
        availableTruncated?: unknown;
        column?: unknown;
        rule?: unknown;
        /** `NOT_FOUND`: the kind of reference. */
        resource?: unknown;
        /** A trashed refusal's dates (`DELETED`, `WORKSPACE_DELETED`). */
        data?: unknown;
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
      // A maintenance pause refused the request before any work: wait it out and send it again
      // while the wait stays bounded (plan D3), else fail with the end time.
      if (error.response?.status === 503 && error.response.data?.error === 'MAINTENANCE') {
        const data = error.response.data;
        const details = data.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : {};
        const headers = error.response.headers;
        const header: unknown = headers instanceof AxiosHeaders ? headers.get('retry-after') : headers?.['retry-after'];
        let retryAfterSeconds: number | undefined;
        if (typeof header === 'string' && /^\d+$/.test(header.trim())) retryAfterSeconds = Number(header.trim());
        else if (typeof details.retryAfterSeconds === 'number') retryAfterSeconds = details.retryAfterSeconds;
        const until = typeof details.until === 'string' ? details.until : undefined;
        const resend = error.config ? resends.get(error.config) : undefined;
        const decision = resend && maintenanceRetry({
          retryAfterSeconds, waitedMs: resend.waitedMs, attempts: resend.attempts,
          // A web ReadableStream body is not detected; the CLI never sends one.
          streamBody: resend.config.data instanceof Stream,
        });
        if (resend && decision) {
          console.error(maintenanceWaitLine(until, decision.waitMs / 1000));
          await maintenanceWait(decision.waitMs, resend.config);
          const tally: MaintenanceTally = { waitedMs: resend.waitedMs + decision.waitMs, attempts: resend.attempts + 1 };
          return client.request({ ...resend.config, [MAINTENANCE_TALLY]: tally } as AxiosRequestConfig);
        }
        throw new CliError('MAINTENANCE', data.message || 'Tokenrip is paused for maintenance.', { until, retryAfterSeconds });
      }
      if (error.response?.data?.error) {
        const data = error.response.data;
        const errorCode = data.error ?? 'API_ERROR';
        let message = data.message || 'Unknown API error';
        const fieldLines: string[] = [];
        // A trashed refusal (410 DELETED / WORKSPACE_DELETED, or 409 WORKSPACE_DELETED on restore) carries its dates in `data`.
        const trashed = (errorCode === 'DELETED' || errorCode === 'WORKSPACE_DELETED')
          && data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data as Record<string, unknown> : {};
        const safeDetails = safeErrorDetails(errorCode, Array.isArray(data.details) ? data.details : {
          ...trashed,
          ...(data.details && typeof data.details === 'object' ? data.details : {}),
          ...Object.fromEntries(['field', 'fields', 'status', 'currentVersionId', 'currentRevision', 'currentWorkspaceRevision', 'reason', 'holder', 'reviewer', 'latestRound',
            'usedBytes', 'limitBytes', 'addedBytes', 'plan', 'path', 'available', 'availableTruncated', 'column', 'rule', 'resource']
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
