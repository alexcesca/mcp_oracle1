#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";

// Importar serviço Oracle e registrador de ferramentas
import { OracleService } from "./tools/oracle-service.js";
import { registerAllTools } from "./tools/register-tools.js";
import { VERSION } from "./common/version.js";
import { logger } from "./common/logger.js";
import {
  parseAuthConfig,
  authenticateRequest,
  sendAuthError,
  stopCleanupTimer,
  type AuthConfig,
} from "./common/auth.js";

// Criar o Servidor MCP com a configuração adequada
const server = new McpServer({
  name: "oracle-db-mcp-server",
  version: VERSION,
});

// Criar instância do serviço Oracle (inicialização tardia)
let oracleService: OracleService | null = null;

function getOracleService(): OracleService {
  if (!oracleService) {
    try {
      oracleService = new OracleService();
    } catch (error: any) {
      throw new Error(`Erro de configuração do Oracle: ${error.message}`);
    }
  }
  return oracleService;
}

// Registrar todas as ferramentas
registerAllTools(server, getOracleService);

const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 3100;
const DEFAULT_HTTP_PATH = '/mcp';
type SessionMode = 'stateful' | 'stateless';
const DEFAULT_SESSION_MODE: SessionMode = 'stateful';

function parseSessionMode(value: string | undefined, source: 'MCP_SESSION_MODE' | 'override' = 'MCP_SESSION_MODE'): SessionMode {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_SESSION_MODE;
  }

  if (normalized === 'stateful' || normalized === 'stateless') {
    return normalized;
  }

  throw new Error(`Valor inválido para ${source}: '${value}'. Use 'stateful' ou 'stateless'.`);
}

function normalizePath(path: string): string {
  let normalized = path.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function parseAllowedOrigins(origins?: string, port?: number): string[] {
  if (origins) {
    return origins.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
  }

  if (!port) {
    port = DEFAULT_HTTP_PORT;
  }

  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

interface HttpConfig {
  host: string;
  port: number;
  path: string;
  sessionMode: SessionMode;
  allowedOrigins: string[];
}

function getHttpConfigFromEnv(): HttpConfig {
  const host = process.env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;
  const port = parseInt(process.env.MCP_HTTP_PORT || String(DEFAULT_HTTP_PORT), 10) || DEFAULT_HTTP_PORT;
  const path = normalizePath(process.env.MCP_HTTP_PATH || DEFAULT_HTTP_PATH);
  const sessionMode = parseSessionMode(process.env.MCP_SESSION_MODE, 'MCP_SESSION_MODE');
  const allowedOrigins = parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS, port);

  return {
    host,
    port,
    path,
    sessionMode,
    allowedOrigins,
  };
}

function resolveHttpConfig(overrides?: Partial<HttpConfig>): HttpConfig {
  const baseConfig = getHttpConfigFromEnv();
  if (!overrides) {
    return baseConfig;
  }

  return {
    host: overrides.host ?? baseConfig.host,
    port: overrides.port ?? baseConfig.port,
    path: overrides.path ? normalizePath(overrides.path) : baseConfig.path,
    sessionMode: overrides.sessionMode ? parseSessionMode(overrides.sessionMode, 'override') : baseConfig.sessionMode,
    allowedOrigins: overrides.allowedOrigins ?? baseConfig.allowedOrigins,
  };
}

function validateOrigin(req: IncomingMessage, allowedOrigins: string[]): void {
  const origin = req.headers.origin;
  if (!origin) {
    return;
  }
  if (allowedOrigins.includes('*')) {
    return;
  }
  if (!allowedOrigins.includes(origin)) {
    throw new Error(`Origin header '${origin}' is not allowed`);
  }
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch (error: any) {
    throw new Error(`Falha ao parsear JSON do corpo da requisição: ${error.message}`);
  }
}

let httpServer: HttpServer | null = null;

async function runServer(overrides?: Partial<HttpConfig>) {
  try {
    logger.info("Criando Servidor MCP Oracle DB...");
    logger.info("Info do servidor: oracle-db-mcp-server");
    logger.info("Versão:", VERSION);

    // Validar variáveis de ambiente
    const requiredVars = ['ORACLE_HOST', 'ORACLE_USERNAME', 'ORACLE_PASSWORD'];
    const missingVars = requiredVars.filter(varName => !process.env[varName] && !process.env.ORACLE_CONNECTION_STRING);

    if (missingVars.length > 0 && !process.env.ORACLE_CONNECTION_STRING) {
      logger.error("Aviso: Variáveis de ambiente ausentes:", missingVars.join(', '));
      logger.error("Defina as variáveis individuais ou use ORACLE_CONNECTION_STRING");
    }

    // Log de configuração (sem a senha)
    logger.info("Configuração do Oracle:");
    logger.info("- ORACLE_HOST:", process.env.ORACLE_HOST || 'localhost');
    logger.info("- ORACLE_PORT:", process.env.ORACLE_PORT || '1521');
    logger.info("- ORACLE_SERVICE_NAME:", process.env.ORACLE_SERVICE_NAME || 'XE');
    logger.info("- ORACLE_USERNAME:", process.env.ORACLE_USERNAME || process.env.ORACLE_USER || 'hr');
    logger.info("- ORACLE_PASSWORD:", process.env.ORACLE_PASSWORD ? '***' : 'NÃO DEFINIDA');
    logger.info("- ORACLE_CONNECTION_STRING:", process.env.ORACLE_CONNECTION_STRING ? 'DEFINIDA' : 'NÃO DEFINIDA');
    logger.info("- ORACLE_OLD_CRYPTO:", process.env.ORACLE_OLD_CRYPTO || 'false');

    const httpConfig = resolveHttpConfig(overrides);

    // --- Autenticação ---
    const authConfig: AuthConfig = parseAuthConfig();
    if (!authConfig.enabled) {
      logger.info('[AUTH] ⚠️  Autenticação DESABILITADA (MCP_AUTH_ENABLED=false). Recomendado apenas para desenvolvimento local.');
    } else if (authConfig.apiKeyHashes.size === 0) {
      logger.error('[AUTH] ❌ Autenticação habilitada mas MCP_API_KEYS / MCP_API_KEYS_PLAIN não configurados. Todas as requisições serão rejeitadas.');
    } else {
      logger.info(`[AUTH] ✅ Autenticação habilitada – ${authConfig.apiKeyHashes.size} chave(s) configurada(s).`);
    }

    const transports = new Map<string, SSEServerTransport>();

    logger.info('Configuração HTTP MCP:');
    logger.info(`- Host: ${httpConfig.host}`);
    logger.info(`- Porta: ${httpConfig.port}`);
    logger.info(`- Path: ${httpConfig.path}`);
    logger.info(`- Modo de sessão (ignorado em SSE clássico): ${httpConfig.sessionMode}`);
    logger.info(`- Allowed Origins: ${httpConfig.allowedOrigins.join(', ')}`);

    const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        
        try {
          validateOrigin(req, httpConfig.allowedOrigins);
        } catch (originError: any) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: originError.message }));
          return;
        }

        // Add CORS headers for browser clients
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // --- Autenticação (todas as rotas protegidas, exceto OPTIONS) ---
        const authError = authenticateRequest(req, authConfig);
        if (authError) {
          sendAuthError(res, authError);
          return;
        }

        // GET /mcp -> Start SSE Stream
        if (url.pathname === httpConfig.path && req.method === 'GET') {
          const transport = new SSEServerTransport(httpConfig.path + '/message', res as any, {
            enableDnsRebindingProtection: false
          });
          
          transports.set(transport.sessionId, transport);
          res.on('close', () => {
            transports.delete(transport.sessionId);
          });

          await server.connect(transport);
          return;
        }

        // POST /mcp/message -> Receive messages
        if (url.pathname === httpConfig.path + '/message' && req.method === 'POST') {
          const sessionId = url.searchParams.get('sessionId');
          if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('sessionId required');
            return;
          }

          const transport = transports.get(sessionId);
          if (!transport) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Session not found');
            return;
          }

          await transport.handlePostMessage(req as any, res as any);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (error: any) {
        logger.error('Erro na requisição HTTP/SSE:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      }
    };

    httpServer = createHttpServer(requestHandler);

    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(httpConfig.port, httpConfig.host, () => {
        logger.info(`Servidor MCP ouvindo em http://${httpConfig.host}:${httpConfig.port}${httpConfig.path}`);
        resolve();
      });
      httpServer!.on('error', reject);
    });

    logger.info("Servidor MCP conectado e pronto!");
    logger.info("Ferramentas disponíveis:", [
      "oracle_health_check",
      "oracle_query",
      "oracle_info",
      "oracle_resumo_programacao_leite"
    ]);

  } catch (error) {
    logger.error("Erro ao iniciar o servidor:", error);
    logger.error("Stack trace:", (error as Error).stack);
    process.exit(1);
  }
}

// Limpeza ao sair
async function shutdown(): Promise<void> {
  logger.info('Encerrando servidor...');
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
  }

  stopCleanupTimer();

  if (oracleService) {
    await oracleService.close();
  }

  try {
    await server.close();
  } catch (error: any) {
    logger.error('Erro ao fechar o servidor MCP:', error.message || error);
  }
}

process.on('SIGINT', async () => {
  logger.info('Recebido SIGINT, limpando...');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recebido SIGTERM, limpando...');
  await shutdown();
  process.exit(0);
});

// Exportar funções para uso em testes e controle programático
export { runServer, shutdown, server, getHttpConfigFromEnv, resolveHttpConfig, parseSessionMode };

// Iniciar o servidor automaticamente por padrão. Para evitar auto-start em testes,
// defina `MCP_AUTO_START=false` no ambiente antes de importar este módulo.
if (process.env.MCP_AUTO_START !== 'false') {
  runServer();
}