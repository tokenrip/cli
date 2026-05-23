import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';

export interface OAuthListener {
  port: number;
  /** Resolves with the OAuth callback params when /callback is hit. */
  await: Promise<{ code: string; state: string }>;
  close: () => void;
}

/**
 * Start a localhost HTTP server on an ephemeral port that resolves a Promise
 * when the OAuth callback hits `/callback?code=...&state=...`. Responds to the
 * browser with a "You can close this tab" HTML page.
 */
export async function startOAuthListener(): Promise<OAuthListener> {
  let resolveCallback: (value: { code: string; state: string }) => void;
  let rejectCallback: (err: Error) => void;
  const callbackPromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1`);

    if (url.pathname !== '/callback') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body style="font-family: system-ui; padding: 2em;"><h1>Authorization failed</h1><p>' + error + '</p><p>You can close this tab.</p></body></html>');
      rejectCallback(new Error(`OAuth error: ${error}`));
      return;
    }

    if (!code || !state) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body style="font-family: system-ui; padding: 2em;"><h1>Missing OAuth parameters</h1><p>The callback URL is missing `code` or `state`.</p></body></html>');
      rejectCallback(new Error('Missing code or state in OAuth callback'));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<html><body style="font-family: system-ui; padding: 2em; text-align: center;"><h1>✓ Connected</h1><p>You can close this tab and return to your terminal.</p></body></html>');
    resolveCallback({ code, state });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  if (!port) throw new Error('Failed to bind listener to ephemeral port');

  return {
    port,
    await: callbackPromise,
    close: () => server.close(),
  };
}
