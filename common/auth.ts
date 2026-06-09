/**
 * MCP Authentication Module
 *
 * Implementa autenticação via Bearer Token (API Keys) conforme:
 *   - MCP Specification (2025-03-26) – Authorization section
 *   - RFC 6750 – Bearer Token Usage
 *   - OWASP API Security Top 10
 *
 * Mecanismo:
 *   1. O cliente passa a chave em  `Authorization: Bearer <key>`  ou `x-api-key: <key>`
 *   2. A chave recebida é hasheada (SHA-256) e comparada em tempo-constante
 *      contra os hashes armazenados – jamais os valores originais.
 *   3. Rate-limiting por IP previne força-bruta.
 *   4. Falha-segura: se auth está habilitada mas nenhuma chave foi configurada,
 *      todas as requisições são rejeitadas (503).
 */

import { timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AuthConfig {
  /** Autenticação habilitada (default: true) */
  enabled: boolean;
  /** Conjunto de hashes SHA-256 (hex) das chaves válidas */
  apiKeyHashes: Set<string>;
  /** Janela de rate-limit em ms (default: 60 000) */
  rateLimitWindowMs: number;
  /** Máximo de requisições por janela (default: 100) */
  rateLimitMaxRequests: number;
  /** Duração do bloqueio após exceder limite em ms (default: 300 000) */
  blockDurationMs: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

export interface AuthError {
  status: 401 | 403 | 429 | 503;
  error: string;
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Rate Limiter (in-memory, stateless entre reinicializações)
// ---------------------------------------------------------------------------

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Limpeza periódica de entradas expiradas para evitar vazamento de memória */
const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_MAX_AGE_MS = 600_000; // 10 min

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitStore) {
      if (now - entry.windowStart > ENTRY_MAX_AGE_MS) {
        rateLimitStore.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref(); // .unref() evita que o timer segure o processo vivo
}

export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Utilitários de chave
// ---------------------------------------------------------------------------

/**
 * Gera uma chave de API aleatória criptograficamente segura (256 bits, base64url).
 */
export function generateApiKey(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Retorna o hash SHA-256 (hex) de uma chave de API.
 * Armazene apenas o hash; jamais a chave em si.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Comparação em tempo-constante de duas strings.
 * Necessária para prevenir timing attacks ao comparar segredos.
 */
function safeStringEqual(a: string, b: string): boolean {
  // Mesmo tamanho diferente deve executar o timingSafeEqual para não vazar tempo
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    // Executa operação fictícia para equalizar tempo
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Configuração via variáveis de ambiente
// ---------------------------------------------------------------------------

/**
 * Lê a configuração de autenticação das variáveis de ambiente.
 *
 * Variáveis suportadas:
 *   MCP_AUTH_ENABLED         – "false" para desabilitar (default: "true")
 *   MCP_API_KEYS             – hashes SHA-256 separados por vírgula (recomendado)
 *   MCP_API_KEYS_PLAIN       – chaves em texto plano separadas por vírgula (hasheadas na inicialização)
 *   MCP_RATE_LIMIT_WINDOW_MS – janela em ms (default: 60000)
 *   MCP_RATE_LIMIT_MAX       – máx. requisições por janela (default: 100)
 *   MCP_RATE_LIMIT_BLOCK_MS  – duração do bloqueio em ms (default: 300000)
 */
export function parseAuthConfig(): AuthConfig {
  const enabled = (process.env.MCP_AUTH_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

  const apiKeyHashes = new Set<string>();

  // Chaves já hasheadas (formato preferido para produção)
  const rawHashes = process.env.MCP_API_KEYS ?? '';
  for (const h of rawHashes.split(',').map(k => k.trim()).filter(k => k.length === 64)) {
    // Validação básica: SHA-256 hex tem exatamente 64 caracteres
    if (/^[0-9a-f]{64}$/i.test(h)) {
      apiKeyHashes.add(h.toLowerCase());
    } else {
      logger.error(`[AUTH] Valor inválido em MCP_API_KEYS ignorado (esperado SHA-256 hex de 64 chars): ${h.slice(0, 8)}...`);
    }
  }

  // Chaves em texto plano – hasheadas aqui e descartadas da memória
  const plainKeys = process.env.MCP_API_KEYS_PLAIN ?? '';
  let plainCount = 0;
  for (const key of plainKeys.split(',').map(k => k.trim()).filter(k => k.length > 0)) {
    if (key.length < 16) {
      logger.error('[AUTH] Chave em MCP_API_KEYS_PLAIN ignorada: comprimento mínimo é 16 caracteres');
      continue;
    }
    apiKeyHashes.add(hashApiKey(key));
    plainCount++;
  }

  if (enabled && plainCount > 0) {
    logger.info(`[AUTH] ${plainCount} chave(s) plain-text hasheada(s) na inicialização. Considere usar MCP_API_KEYS com hashes pré-computados.`);
  }

  const rateLimitWindowMs = Math.max(1000, parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? '60000', 10));
  const rateLimitMaxRequests = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT_MAX ?? '100', 10));
  const blockDurationMs = Math.max(1000, parseInt(process.env.MCP_RATE_LIMIT_BLOCK_MS ?? '300000', 10));

  startCleanupTimer();

  return { enabled, apiKeyHashes, rateLimitWindowMs, rateLimitMaxRequests, blockDurationMs };
}

// ---------------------------------------------------------------------------
// Extração do IP do cliente (suporte a proxies reversos)
// ---------------------------------------------------------------------------

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // Pega somente o primeiro IP (o mais à esquerda é o cliente original)
    const ip = first.split(',')[0].trim();
    // Sanitização básica para evitar log injection
    return ip.replace(/[^0-9a-f.:]/gi, '?').slice(0, 45);
  }
  return (req.socket?.remoteAddress ?? 'unknown').slice(0, 45);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

function checkRateLimit(ip: string, config: AuthConfig): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry) {
    entry = { count: 0, windowStart: now, blocked: false, blockedUntil: 0 };
    rateLimitStore.set(ip, entry);
  }

  // IP bloqueado?
  if (entry.blocked) {
    if (now < entry.blockedUntil) {
      return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
    }
    // Bloqueio expirou – reset
    entry.blocked = false;
    entry.count = 0;
    entry.windowStart = now;
  }

  // Janela expirou?
  if (now - entry.windowStart > config.rateLimitWindowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count++;

  if (entry.count > config.rateLimitMaxRequests) {
    entry.blocked = true;
    entry.blockedUntil = now + config.blockDurationMs;
    logger.error(`[AUTH] Rate limit atingido para IP: ${ip}. Bloqueado por ${config.blockDurationMs / 1000}s.`);
    return { allowed: false, retryAfter: Math.ceil(config.blockDurationMs / 1000) };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Validação da chave de API
// ---------------------------------------------------------------------------

function extractApiKey(req: IncomingMessage): string | undefined {
  // 1. Authorization: Bearer <key>  (padrão MCP / RFC 6750)
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const key = authHeader.slice(7).trim();
    return key.length > 0 ? key : undefined;
  }

  // 2. x-api-key: <key>  (alternativa amplamente suportada)
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) {
    const key = (Array.isArray(xApiKey) ? xApiKey[0] : xApiKey).trim();
    return key.length > 0 ? key : undefined;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Função principal de autenticação
// ---------------------------------------------------------------------------

/**
 * Autentica uma requisição HTTP.
 *
 * @returns `null` se a requisição é permitida; `AuthError` caso contrário.
 *
 * A lógica de rate-limit é sempre aplicada, mesmo quando auth está desabilitada,
 * para proteger contra DDoS mesmo em ambientes de desenvolvimento.
 */
export function authenticateRequest(req: IncomingMessage, config: AuthConfig): AuthError | null {
  const clientIp = getClientIp(req);

  // --- Rate limiting ---
  const rateCheck = checkRateLimit(clientIp, config);
  if (!rateCheck.allowed) {
    return { status: 429, error: 'Too Many Requests', retryAfter: rateCheck.retryAfter };
  }

  // --- Auth desabilitada ---
  if (!config.enabled) {
    return null;
  }

  // --- Fail-safe: auth habilitada mas sem chaves configuradas ---
  if (config.apiKeyHashes.size === 0) {
    logger.error('[AUTH] ERRO: Autenticação habilitada mas nenhuma chave API configurada (MCP_API_KEYS ou MCP_API_KEYS_PLAIN). Rejeitando todas as requisições.');
    return { status: 503, error: 'Server misconfiguration: no API keys configured. Set MCP_API_KEYS or disable auth with MCP_AUTH_ENABLED=false.' };
  }

  // --- Extração da chave ---
  const providedKey = extractApiKey(req);
  if (!providedKey) {
    logger.info(`[AUTH] Chave ausente – IP: ${clientIp} ${req.method} ${req.url}`);
    return {
      status: 401,
      error: 'Unauthorized: API key required. Provide "Authorization: Bearer <key>" or "x-api-key: <key>" header.',
    };
  }

  // --- Validação em tempo-constante ---
  const providedHash = hashApiKey(providedKey);
  let valid = false;

  for (const storedHash of config.apiKeyHashes) {
    if (safeStringEqual(providedHash, storedHash)) {
      valid = true;
      // Não interromper o loop para manter tempo-constante seria ideal,
      // mas com conjuntos grandes o impacto é aceitável dado que é SHA-256 vs SHA-256.
      // Saída antecipada é aceitável pois o atacante não sabe quantas chaves existem.
      break;
    }
  }

  if (!valid) {
    logger.info(`[AUTH] Chave inválida – IP: ${clientIp} ${req.method} ${req.url}`);
    return { status: 403, error: 'Forbidden: Invalid API key.' };
  }

  logger.debug(`[AUTH] Autenticado – IP: ${clientIp} ${req.method} ${req.url}`);
  return null;
}

// ---------------------------------------------------------------------------
// Helper para enviar respostas de erro de autenticação
// ---------------------------------------------------------------------------

/**
 * Envia a resposta HTTP de erro de autenticação com headers padrão RFC 6750.
 */
export function sendAuthError(res: ServerResponse, authError: AuthError): void {
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json',
  };

  if (authError.status === 401) {
    // RFC 6750 §3: WWW-Authenticate obrigatório em 401
    headers['WWW-Authenticate'] = 'Bearer realm="oracle-db-mcp-server", charset="UTF-8"';
  }

  if (authError.retryAfter !== undefined) {
    headers['Retry-After'] = authError.retryAfter;
  }

  res.writeHead(authError.status, headers);
  res.end(JSON.stringify({ error: authError.error }));
}

// ---------------------------------------------------------------------------
// Metadata OAuth 2.1 (MCP spec discovery)
// ---------------------------------------------------------------------------

/**
 * Retorna o objeto de metadata do Authorization Server conforme
 * RFC 8414 / MCP Spec 2025-03-26 §Authorization.
 *
 * Exposto em `GET /.well-known/oauth-authorization-server`.
 */
export function buildOAuthMetadata(baseUrl: string): Record<string, unknown> {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    token_endpoint_auth_methods_supported: ['none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp'],
    service_documentation: 'https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization/',
  };
}
