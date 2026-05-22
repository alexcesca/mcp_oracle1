import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Disable TLS verification for self-signed certificates in fetch globally for these tests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let serverModule: any;

async function readSseMessage(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let buffer = '';

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const endIndex = buffer.indexOf('\n\n');
    if (endIndex !== -1) {
      const eventText = buffer.slice(0, endIndex).trim();
      const lines = eventText.split(/\r?\n/);
      let event: string | undefined;
      const dataLines: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('event:')) {
          event = trimmedLine.slice('event:'.length).trim();
        } else if (trimmedLine.startsWith('data:')) {
          dataLines.push(trimmedLine.slice('data:'.length));
        }
      }

      if (!event) {
        continue;
      }

      const dataString = dataLines.join('\n').trim();
      try {
        return {
          event,
          data: dataString ? JSON.parse(dataString) : undefined,
        };
      } catch (error: any) {
        console.error('Failed to parse SSE event data:', JSON.stringify(dataString));
        console.error('Full SSE event text:', JSON.stringify(eventText));
        throw error;
      }
    }
  }

  throw new Error('Timed out waiting for SSE message');
}

describe('HTTP/SSE transport integration', () => {
  let httpPort = 31001 + Math.floor(Math.random() * 1000);
  let baseUrl = `http://127.0.0.1:${httpPort}`;

  beforeAll(async () => {
    // Prevent auto-start on import
    process.env.MCP_AUTO_START = 'false';

    serverModule = await import('../index');
    await serverModule.runServer({
      transportMode: 'http',
      host: '127.0.0.1',
      port: httpPort,
      path: '/mcp',
      sessionMode: 'stateful',
      allowedOrigins: [baseUrl],
    });
  }, 20000);

  afterAll(async () => {
    if (serverModule && serverModule.shutdown) {
      await serverModule.shutdown();
    }
  });

  it('should initialize over HTTP/SSE and accept JSON-RPC POSTs', async () => {
    const sseUrl = `${baseUrl}/mcp`;

    const initResponse = await fetch(sseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          clientInfo: { name: 'jest-http-transport-test', version: '1.0.0' },
        },
      }),
    });

    expect(initResponse.ok).toBe(true);
    expect(initResponse.headers.get('content-type')).toContain('text/event-stream');

    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(initResponse.body).toBeDefined();

    const reader = initResponse.body!.getReader();
    const event = await readSseMessage(reader, new TextDecoder('utf-8'), 5000);
    expect(event.event).toBe('message');
    expect(event.data).toHaveProperty('jsonrpc', '2.0');
    expect(event.data).toHaveProperty('id', 1);

    await reader.cancel();

    const postResponse = await fetch(sseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId ?? '',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'oracle_health_check', params: {} }),
    });

    expect(postResponse.ok).toBe(true);
    expect(postResponse.headers.get('content-type')).toContain('text/event-stream');
    const postReader = postResponse.body!.getReader();
    const postEvent = await readSseMessage(postReader, new TextDecoder('utf-8'), 5000);
    expect(postEvent.event).toBe('message');
    expect(postEvent.data).toHaveProperty('jsonrpc', '2.0');
    expect(postEvent.data).toHaveProperty('id', 2);
    await postReader.cancel();
  }, 30000);
});

describe('HTTPS/SSE transport integration', () => {
  let httpsPort = 32001 + Math.floor(Math.random() * 1000);
  let baseUrl = `https://127.0.0.1:${httpsPort}`;
  const keyPath = join(__dirname, 'key.pem');
  const certPath = join(__dirname, 'cert.pem');
  beforeAll(async () => {
    // Generate self-signed certificate
    try {
      execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -sha256 -days 365 -nodes -subj "/CN=127.0.0.1"`, { stdio: 'ignore' });
    } catch (err) {
      console.error('Failed to generate self-signed SSL certificate using openssl:', err);
      throw err;
    }

    // Import and start server
    process.env.MCP_AUTO_START = 'false';
    serverModule = await import('../index');
    await serverModule.runServer({
      transportMode: 'https',
      host: '127.0.0.1',
      port: httpsPort,
      path: '/mcp',
      sessionMode: 'stateful',
      allowedOrigins: [baseUrl],
      sslKeyPath: keyPath,
      sslCertPath: certPath,
    });
  }, 20000);

  afterAll(async () => {
    if (serverModule && serverModule.shutdown) {
      await serverModule.shutdown();
    }

    // Clean up cert files
    try {
      if (existsSync(keyPath)) unlinkSync(keyPath);
      if (existsSync(certPath)) unlinkSync(certPath);
    } catch (err) {
      console.error('Failed to clean up certificates:', err);
    }
  });

  it('should initialize over HTTPS/SSE and accept JSON-RPC POSTs', async () => {
    const sseUrl = `${baseUrl}/mcp`;

    const initResponse = await fetch(sseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          clientInfo: { name: 'jest-https-transport-test', version: '1.0.0' },
        },
      }),
    });

    expect(initResponse.ok).toBe(true);
    expect(initResponse.headers.get('content-type')).toContain('text/event-stream');

    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(initResponse.body).toBeDefined();

    const reader = initResponse.body!.getReader();
    const event = await readSseMessage(reader, new TextDecoder('utf-8'), 5000);
    expect(event.event).toBe('message');
    expect(event.data).toHaveProperty('jsonrpc', '2.0');
    expect(event.data).toHaveProperty('id', 1);

    await reader.cancel();

    const postResponse = await fetch(sseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId ?? '',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'oracle_health_check', params: {} }),
    });

    expect(postResponse.ok).toBe(true);
    expect(postResponse.headers.get('content-type')).toContain('text/event-stream');
    const postReader = postResponse.body!.getReader();
    const postEvent = await readSseMessage(postReader, new TextDecoder('utf-8'), 5000);
    expect(postEvent.event).toBe('message');
    expect(postEvent.data).toHaveProperty('jsonrpc', '2.0');
    expect(postEvent.data).toHaveProperty('id', 2);
    await postReader.cancel();
  }, 30000);
});
