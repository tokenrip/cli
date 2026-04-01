import axios, { AxiosInstance, AxiosError } from 'axios';
import { CliError } from './errors.js';

const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  apiKey?: string;
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const client = axios.create({
    baseURL: config.baseUrl || 'https://api.tokenrip.com',
    timeout: config.timeout || DEFAULT_TIMEOUT,
    headers,
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ ok: boolean; error?: string; message?: string }>) => {
      if (error.response?.status === 401) {
        throw new CliError(
          'UNAUTHORIZED',
          'API key required or invalid. Run `tokenrip auth create-key` or set TOKENRIP_API_KEY.',
        );
      }
      if (error.response?.data?.error) {
        throw new CliError(error.response.data.error, error.response.data.message || 'Unknown API error');
      }
      if (error.code === 'ECONNABORTED') {
        throw new CliError('TIMEOUT', 'Request timeout — is the Tokenrip server running?');
      }
      const details = error.code || error.message || 'Unknown error';
      throw new CliError('NETWORK_ERROR', `Network error (${details}) — is the API server running? Try: tokenrip config set-url http://localhost:3434`);
    },
  );

  return client;
}
