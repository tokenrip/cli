import http from 'node:http';
import https from 'node:https';
import type { Socket } from 'node:net';
import { Readable, type Duplex } from 'node:stream';
import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

const IDLE_RETENTION_MS = 5000;

type NativeOptions = http.AgentOptions & { proxyEnv?: Record<string, string | undefined> };
type AgentPair = { http: http.Agent; https: https.Agent };
type OwnedRequest = { release: () => void; stream?: Readable; detachStreamListeners?: () => void };
const optionsOf = (agent: http.Agent): NativeOptions => (agent as http.Agent & { options: NativeOptions }).options;

/** Track native sockets while CONNECT is pending, before Node adds them to its pool. */
function managedAgent<T extends http.Agent>(agent: T, reusable: boolean): T {
  const pending = new Set<Socket>();
  const connect = agent.createConnection.bind(agent);
  agent.createConnection = (options, callback) => {
    let socket: Socket;
    const connected = (error: Error | null, connectedSocket: Duplex) => {
      pending.delete(socket);
      callback?.(error, connectedSocket);
    };
    socket = connect(options, connected) as Socket;
    if (socket) {
      pending.add(socket);
      socket.once('close', () => pending.delete(socket));
    }
    return socket;
  };
  const destroy = agent.destroy.bind(agent);
  agent.destroy = () => {
    for (const socket of pending) socket.destroy();
    pending.clear();
    destroy();
  };
  if (reusable) agent.on('free', socket => {
    socket.setTimeout(Math.min(optionsOf(agent).timeout || IDLE_RETENTION_MS, IDLE_RETENTION_MS));
    socket.unref();
  });
  return agent;
}

/** Own only the shared factory's native environment-proxy transport. */
export function createProxyAgentOwner(factoryTimeout: number) {
  let defaultPair: AgentPair | undefined;
  const owners = new WeakMap<InternalAxiosRequestConfig, OwnedRequest>();
  const captureStream = (config: InternalAxiosRequestConfig, data: unknown) => {
    const owner = owners.get(config);
    if (owner && config.responseType === 'stream' && data instanceof Readable) owner.stream = data;
  };
  const settle = (config?: InternalAxiosRequestConfig, response?: AxiosResponse): void => {
    if (!config) return;
    const owner = owners.get(config);
    if (!owner) return;
    const stream = owner.stream;
    if (!response) {
      stream?.destroy();
      owner.release();
    } else if (stream && !stream.destroyed && !stream.readableEnded) {
      const finish = () => owner.release();
      owner.detachStreamListeners = () => {
        stream.removeListener('end', finish);
        stream.removeListener('close', finish);
        stream.removeListener('error', finish);
      };
      stream.once('end', finish);
      stream.once('close', finish);
      stream.once('error', finish);
    } else owner.release();
  };
  const pair = (timeout: number, reusable: boolean): AgentPair => {
    const options = (agent: http.Agent): NativeOptions => ({
      ...optionsOf(agent),
      timeout,
      keepAlive: reusable,
      maxFreeSockets: 16,
      maxTotalSockets: 64,
    });
    return {
      http: managedAgent(new http.Agent(options(http.globalAgent)), reusable),
      https: managedAgent(new https.Agent(options(https.globalAgent)), reusable),
    };
  };
  return {
    prepare(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
      const native = [http.globalAgent, https.globalAgent].some(agent => {
        const env = optionsOf(agent).proxyEnv;
        return typeof env === 'object' && env !== null;
      });
      // The selected runtime agents establish native mode, not environment variables.
      if (!native || process.versions.bun || config.httpAgent || config.httpsAgent ||
          config.transport || config.proxy !== undefined || config.socketPath || config.httpVersion === 2 ||
          axios.getAdapter(config.adapter) !== axios.getAdapter('http')) return config;
      const adapter = axios.getAdapter(config.adapter);
      const timeout = config.timeout;
      // Invalid values remain Axios's responsibility; do not create a different valid policy.
      if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) return config;
      // Cancellable requests own pending CONNECT sockets; releasing one must not
      // destroy the reusable pair's concurrent connections.
      const reusable = timeout === factoryTimeout && timeout > 0 && !config.signal && !config.cancelToken;
      const agents = reusable ? (defaultPair ??= pair(timeout, true)) : pair(timeout, false);
      config.httpAgent = agents.http;
      config.httpsAgent = agents.https;
      let released = false;
      const owner: OwnedRequest = { release: () => {
        if (released) return;
        released = true;
        owners.delete(config);
        owner.detachStreamListeners?.();
        config.signal?.removeEventListener?.('abort', owner.release);
        config.cancelToken?.unsubscribe(owner.release);
        if (!reusable) { agents.http.destroy(); agents.https.destroy(); }
      } };
      owners.set(config, owner);
      if (!reusable) {
        // CancelToken reasons can omit config; release directly from the owner.
        config.signal?.addEventListener?.('abort', owner.release, { once: true });
        config.cancelToken?.subscribe(owner.release);
        if (config.signal?.aborted) owner.release();
      }
      // Delegate stock Axios transport unchanged. Some native adapter failures
      // omit config, so its dispatch owner must close resources before rethrow.
      config.adapter = async adapterConfig => {
        try {
          const response = await adapter(adapterConfig);
          captureStream(adapterConfig, response.data);
          return response;
        } catch (error) {
          captureStream(adapterConfig, (error as { response?: AxiosResponse })?.response?.data);
          settle(adapterConfig);
          throw error;
        }
      };
      return config;
    },
    settle,
  };
}
