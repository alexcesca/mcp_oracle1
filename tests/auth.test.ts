/**
 * Testes unitários do módulo de autenticação MCP (common/auth.ts)
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

// ── helpers para criar mocks leves ──────────────────────────────────────────

function makeRequest(overrides: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  remoteAddress?: string;
}): IncomingMessage {
  const socket = new EventEmitter() as Socket;
  (socket as any).remoteAddress = overrides.remoteAddress ?? '127.0.0.1';

  const req = new EventEmitter() as IncomingMessage;
  req.method = overrides.method ?? 'GET';
  req.url = overrides.url ?? '/mcp';
  req.headers = overrides.headers ?? {};
  (req as any).socket = socket;
  return req;
}

function makeResponse(): { res: ServerResponse; written: { status: number; headers: Record<string, string | number>; body: string } } {
  const written = { status: 200, headers: {} as Record<string, string | number>, body: '' };
  const res = {
    writeHead: (status: number, headers?: Record<string, string | number>) => {
      written.status = status;
      written.headers = { ...headers };
    },
    end: (body?: string) => {
      written.body = body ?? '';
    },
    headersSent: false,
  } as unknown as ServerResponse;
  return { res, written };
}

// ── importar módulo após limpar env ─────────────────────────────────────────

import {
  parseAuthConfig,
  authenticateRequest,
  sendAuthError,
  hashApiKey,
  generateApiKey,
  buildOAuthMetadata,
  stopCleanupTimer,
} from '../common/auth.js';

// ── suíte de testes ──────────────────────────────────────────────────────────

describe('auth – generateApiKey', () => {
  it('deve gerar chave base64url de 43 chars (32 bytes)', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('deve gerar chaves únicas', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe('auth – hashApiKey', () => {
  it('deve retornar SHA-256 hex de 64 chars', () => {
    const hash = hashApiKey('minha-chave-secreta');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deve ser determinístico', () => {
    expect(hashApiKey('abc')).toBe(hashApiKey('abc'));
  });

  it('hashes diferentes para chaves diferentes', () => {
    expect(hashApiKey('chave-a')).not.toBe(hashApiKey('chave-b'));
  });
});

describe('auth – parseAuthConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // limpa vars de auth para cada teste
    delete process.env.MCP_AUTH_ENABLED;
    delete process.env.MCP_API_KEYS;
    delete process.env.MCP_API_KEYS_PLAIN;
    delete process.env.MCP_RATE_LIMIT_WINDOW_MS;
    delete process.env.MCP_RATE_LIMIT_MAX;
    delete process.env.MCP_RATE_LIMIT_BLOCK_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
    stopCleanupTimer();
  });

  it('auth habilitada por padrão', () => {
    const cfg = parseAuthConfig();
    expect(cfg.enabled).toBe(true);
  });

  it('MCP_AUTH_ENABLED=false desabilita auth', () => {
    process.env.MCP_AUTH_ENABLED = 'false';
    const cfg = parseAuthConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('lê hash pré-computado em MCP_API_KEYS', () => {
    const hash = hashApiKey('minha-chave');
    process.env.MCP_API_KEYS = hash;
    const cfg = parseAuthConfig();
    expect(cfg.apiKeyHashes.has(hash)).toBe(true);
  });

  it('ignora valores inválidos em MCP_API_KEYS', () => {
    process.env.MCP_API_KEYS = 'nao-e-um-hash-valido';
    const cfg = parseAuthConfig();
    expect(cfg.apiKeyHashes.size).toBe(0);
  });

  it('MCP_API_KEYS_PLAIN: hash de chave plain na inicialização', () => {
    process.env.MCP_API_KEYS_PLAIN = 'chave-secreta-plain';
    const cfg = parseAuthConfig();
    const expected = hashApiKey('chave-secreta-plain');
    expect(cfg.apiKeyHashes.has(expected)).toBe(true);
  });

  it('MCP_API_KEYS_PLAIN: rejeita chaves com menos de 16 chars', () => {
    process.env.MCP_API_KEYS_PLAIN = 'curta';
    const cfg = parseAuthConfig();
    expect(cfg.apiKeyHashes.size).toBe(0);
  });

  it('defaults numéricos corretos', () => {
    const cfg = parseAuthConfig();
    expect(cfg.rateLimitWindowMs).toBe(60_000);
    expect(cfg.rateLimitMaxRequests).toBe(100);
    expect(cfg.blockDurationMs).toBe(300_000);
  });
});

describe('auth – authenticateRequest', () => {
  const originalEnv = process.env;
  const TEST_KEY = 'chave-de-teste-segura-32chars!!';
  const TEST_HASH = hashApiKey(TEST_KEY);

  const baseConfig = () => parseAuthConfig();

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MCP_AUTH_ENABLED;
    delete process.env.MCP_API_KEYS;
    delete process.env.MCP_API_KEYS_PLAIN;
    process.env.MCP_API_KEYS = TEST_HASH;
    process.env.MCP_RATE_LIMIT_MAX = '1000'; // alto para não interferir em testes
  });

  afterEach(() => {
    process.env = originalEnv;
    stopCleanupTimer();
  });

  it('retorna null quando chave válida via Authorization: Bearer', () => {
    const req = makeRequest({ headers: { authorization: `Bearer ${TEST_KEY}` }, remoteAddress: '10.0.0.1' });
    const cfg = baseConfig();
    expect(authenticateRequest(req, cfg)).toBeNull();
  });

  it('retorna null quando chave válida via x-api-key', () => {
    const req = makeRequest({ headers: { 'x-api-key': TEST_KEY }, remoteAddress: '10.0.0.2' });
    const cfg = baseConfig();
    expect(authenticateRequest(req, cfg)).toBeNull();
  });

  it('retorna 401 quando sem chave', () => {
    const req = makeRequest({ remoteAddress: '10.0.0.3' });
    const cfg = baseConfig();
    const err = authenticateRequest(req, cfg);
    expect(err?.status).toBe(401);
  });

  it('retorna 403 quando chave inválida', () => {
    const req = makeRequest({ headers: { authorization: 'Bearer chave-errada' }, remoteAddress: '10.0.0.4' });
    const cfg = baseConfig();
    const err = authenticateRequest(req, cfg);
    expect(err?.status).toBe(403);
  });

  it('retorna null quando auth desabilitada (sem chave)', () => {
    process.env.MCP_AUTH_ENABLED = 'false';
    const req = makeRequest({ remoteAddress: '10.0.0.5' });
    const cfg = baseConfig();
    expect(authenticateRequest(req, cfg)).toBeNull();
  });

  it('retorna 503 quando auth habilitada mas sem chaves configuradas', () => {
    delete process.env.MCP_API_KEYS;
    const req = makeRequest({ headers: { authorization: `Bearer ${TEST_KEY}` }, remoteAddress: '10.0.0.6' });
    const cfg = parseAuthConfig();
    const err = authenticateRequest(req, cfg);
    expect(err?.status).toBe(503);
  });

  it('retorna 429 após exceder rate limit', () => {
    process.env.MCP_RATE_LIMIT_MAX = '3';
    process.env.MCP_RATE_LIMIT_WINDOW_MS = '60000';
    const cfg = parseAuthConfig();
    const req = () => makeRequest({ headers: { authorization: `Bearer ${TEST_KEY}` }, remoteAddress: '10.0.0.99' });

    // Primeiras 3 devem passar
    expect(authenticateRequest(req(), cfg)).toBeNull();
    expect(authenticateRequest(req(), cfg)).toBeNull();
    expect(authenticateRequest(req(), cfg)).toBeNull();
    // 4ª deve ser bloqueada
    const err = authenticateRequest(req(), cfg);
    expect(err?.status).toBe(429);
  });
});

describe('auth – sendAuthError', () => {
  it('401 inclui WWW-Authenticate header', () => {
    const { res, written } = makeResponse();
    sendAuthError(res, { status: 401, error: 'Unauthorized' });
    expect(written.status).toBe(401);
    expect(written.headers['WWW-Authenticate']).toContain('Bearer realm=');
  });

  it('403 não inclui WWW-Authenticate', () => {
    const { res, written } = makeResponse();
    sendAuthError(res, { status: 403, error: 'Forbidden' });
    expect(written.status).toBe(403);
    expect(written.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('429 inclui Retry-After', () => {
    const { res, written } = makeResponse();
    sendAuthError(res, { status: 429, error: 'Rate limit', retryAfter: 60 });
    expect(written.status).toBe(429);
    expect(written.headers['Retry-After']).toBe(60);
  });

  it('body é JSON válido com campo error', () => {
    const { res, written } = makeResponse();
    sendAuthError(res, { status: 403, error: 'Forbidden: Invalid API key.' });
    const parsed = JSON.parse(written.body);
    expect(parsed.error).toBe('Forbidden: Invalid API key.');
  });
});

describe('auth – buildOAuthMetadata', () => {
  it('retorna campos obrigatórios do RFC 8414', () => {
    const meta = buildOAuthMetadata('http://localhost:3100');
    expect(meta.issuer).toBe('http://localhost:3100');
    expect(meta.token_endpoint).toContain('/oauth/token');
    expect(meta.code_challenge_methods_supported).toContain('S256');
  });
});
