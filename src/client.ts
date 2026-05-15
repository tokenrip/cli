import axios, { AxiosInstance, AxiosError } from 'axios';
import { CliError } from './errors.js';

const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  apiKey?: string;
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const baseUrl = config.baseUrl || 'https://api.tokenrip.com';
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

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
        details?: Array<{ path?: Array<string | number>; message?: string }>;
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
      if (error.response?.status === 401) {
        throw new CliError(
          'UNAUTHORIZED',
          'API key required or invalid. Run `rip auth register` to recover your key.',
        );
      }
      if (error.response?.data?.error) {
        const data = error.response.data;
        const errorCode = data.error ?? 'API_ERROR';
        let message = data.message || 'Unknown API error';
        const fieldLines: string[] = [];
        for (const issue of data.details ?? []) {
          const path = (issue.path ?? []).join('.');
          fieldLines.push(`  ${path || '(root)'}: ${issue.message ?? 'invalid'}`);
        }
        for (const issue of data.errors ?? []) {
          fieldLines.push(`  ${issue.code ?? 'error'}: ${issue.message ?? 'invalid'}`);
        }
        if (fieldLines.length > 0) {
          message += `\n${fieldLines.join('\n')}`;
        }
        throw new CliError(errorCode, message);
      }
      if (error.response?.status === 413) {
        throw new CliError('PAYLOAD_TOO_LARGE', `Payload too large — the server rejected the request body. Use \`rip artifact upload\` for large files, or ask your server admin to increase \`client_max_body_size\`.`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new CliError('TIMEOUT', `Request timeout while contacting ${baseUrl}`);
      }
      const status = error.response?.status;
      const details = error.code || error.message || 'Unknown error';
      const statusInfo = status ? ` (HTTP ${status})` : '';
      throw new CliError('NETWORK_ERROR', `Network error (${details}${statusInfo}) while contacting ${baseUrl}`);
    },
  );

  return client;
}
