#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, Server as HttpServer } from "node:http";
import { createServer as createHttpsServer, Server as HttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Importar serviço Oracle e registrador de ferramentas
import { OracleService } from "./tools/oracle-service.js";
import { registerAllTools } from "./tools/register-tools.js";
import { VERSION } from "./common/version.js";

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
const DEFAULT_SESSION_MODE = 'stateful';

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
  transportMode: 'stdio' | 'http' | 'https';
  host: string;
  port: number;
  path: string;
  sessionMode: 'stateful' | 'stateless';
  allowedOrigins: string[];
  sslKeyPath?: string;
  sslCertPath?: string;
}

function getHttpConfigFromEnv(): HttpConfig {
  const transportMode = (process.env.MCP_TRANSPORT || 'stdio').trim().toLowerCase();
  const host = process.env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;
  const port = parseInt(process.env.MCP_HTTP_PORT || String(DEFAULT_HTTP_PORT), 10) || DEFAULT_HTTP_PORT;
  const path = normalizePath(process.env.MCP_HTTP_PATH || DEFAULT_HTTP_PATH);
  const sessionMode = (process.env.MCP_SESSION_MODE || DEFAULT_SESSION_MODE).trim().toLowerCase();
  const allowedOrigins = parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS, port);
  const sslKeyPath = process.env.MCP_SSL_KEY_PATH || process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.MCP_SSL_CERT_PATH || process.env.SSL_CERT_PATH;

  return {
    transportMode: transportMode === 'https' ? 'https' : (transportMode === 'http' ? 'http' : 'stdio'),
    host,
    port,
    path,
    sessionMode: sessionMode === 'stateless' ? 'stateless' : 'stateful',
    allowedOrigins,
    sslKeyPath,
    sslCertPath,
  };
}

function resolveHttpConfig(overrides?: Partial<HttpConfig>): HttpConfig {
  const baseConfig = getHttpConfigFromEnv();
  if (!overrides) {
    return baseConfig;
  }

  return {
    transportMode: overrides.transportMode ?? baseConfig.transportMode,
    host: overrides.host ?? baseConfig.host,
    port: overrides.port ?? baseConfig.port,
    path: overrides.path ? normalizePath(overrides.path) : baseConfig.path,
    sessionMode: overrides.sessionMode ?? baseConfig.sessionMode,
    allowedOrigins: overrides.allowedOrigins ?? baseConfig.allowedOrigins,
    sslKeyPath: overrides.sslKeyPath ?? baseConfig.sslKeyPath,
    sslCertPath: overrides.sslCertPath ?? baseConfig.sslCertPath,
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

let httpServer: HttpServer | HttpsServer | null = null;

async function runServer(overrides?: Partial<HttpConfig>) {
  try {
    console.error("Criando Servidor MCP Oracle DB...");
    console.error("Info do servidor: oracle-db-mcp-server");
    console.error("Versão:", VERSION);

    // Validar variáveis de ambiente
    const requiredVars = ['ORACLE_HOST', 'ORACLE_USERNAME', 'ORACLE_PASSWORD'];
    const missingVars = requiredVars.filter(varName => !process.env[varName] && !process.env.ORACLE_CONNECTION_STRING);

    if (missingVars.length > 0 && !process.env.ORACLE_CONNECTION_STRING) {
      console.error("Aviso: Variáveis de ambiente ausentes:", missingVars.join(', '));
      console.error("Defina as variáveis individuais ou use ORACLE_CONNECTION_STRING");
    }

    // Log de configuração (sem a senha)
    console.error("Configuração do Oracle:");
    console.error("- ORACLE_HOST:", process.env.ORACLE_HOST || 'localhost');
    console.error("- ORACLE_PORT:", process.env.ORACLE_PORT || '1521');
    console.error("- ORACLE_SERVICE_NAME:", process.env.ORACLE_SERVICE_NAME || 'XE');
    console.error("- ORACLE_USERNAME:", process.env.ORACLE_USERNAME || process.env.ORACLE_USER || 'hr');
    console.error("- ORACLE_PASSWORD:", process.env.ORACLE_PASSWORD ? '***' : 'NÃO DEFINIDA');
    console.error("- ORACLE_CONNECTION_STRING:", process.env.ORACLE_CONNECTION_STRING ? 'DEFINIDA' : 'NÃO DEFINIDA');
    console.error("- ORACLE_OLD_CRYPTO:", process.env.ORACLE_OLD_CRYPTO || 'false');

    const httpConfig = resolveHttpConfig(overrides);
    const isHttpMode = httpConfig.transportMode === 'http' || httpConfig.transportMode === 'https';
    const isHttps = httpConfig.transportMode === 'https';

    console.error(`Iniciando Servidor MCP Oracle DB em modo ${isHttpMode ? (isHttps ? 'https/sse' : 'http/sse') : 'stdio'}...`);

    const transport = isHttpMode
      ? new StreamableHTTPServerTransport({
        sessionIdGenerator: httpConfig.sessionMode === 'stateful' ? () => randomUUID() : undefined,
        allowedOrigins: httpConfig.allowedOrigins,
        enableDnsRebindingProtection: false,
        retryInterval: 3000,
      })
      : new StdioServerTransport();

    const httpTransport = isHttpMode ? transport as StreamableHTTPServerTransport : undefined;

    if (isHttpMode) {
      console.error(`${isHttps ? 'Configuração HTTPS MCP:' : 'Configuração HTTP MCP:'}`);
      console.error(`- Host: ${httpConfig.host}`);
      console.error(`- Porta: ${httpConfig.port}`);
      console.error(`- Path: ${httpConfig.path}`);
      console.error(`- Modo de sessão: ${httpConfig.sessionMode}`);
      console.error(`- Allowed Origins: ${httpConfig.allowedOrigins.join(', ')}`);
      if (isHttps) {
        console.error(`- SSL Key Path: ${httpConfig.sslKeyPath}`);
        console.error(`- SSL Cert Path: ${httpConfig.sslCertPath}`);
      }
    }

    console.error("Conectando servidor ao transporte...");

    // Conectar servidor ao transporte - isso deve manter o processo ativo
    await server.connect(transport);

    if (isHttpMode) {
      const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const protocol = isHttps ? 'https' : 'http';
          const url = new URL(req.url || '/', `${protocol}://${req.headers.host || '127.0.0.1'}`);
          if (url.pathname !== httpConfig.path) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          try {
            validateOrigin(req, httpConfig.allowedOrigins);
          } catch (originError: any) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: originError.message }));
            return;
          }

          if (req.method === 'POST') {
            let parsedBody: unknown;
            try {
              parsedBody = await parseJsonBody(req);
            } catch (bodyError: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: bodyError.message }));
              return;
            }
            await httpTransport!.handleRequest(req, res, parsedBody);
            return;
          }

          if (req.method === 'GET' || req.method === 'DELETE') {
            await httpTransport!.handleRequest(req, res);
            return;
          }

          res.writeHead(405, {
            'Content-Type': 'application/json',
            Allow: 'GET, POST, DELETE',
          });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (error: any) {
          console.error('Erro na requisição HTTP/HTTPS:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      };

      if (isHttps) {
        if (!httpConfig.sslKeyPath || !httpConfig.sslCertPath) {
          throw new Error('Caminhos para chave privada (MCP_SSL_KEY_PATH) e certificado (MCP_SSL_CERT_PATH) são necessários para o modo HTTPS.');
        }
        let key: Buffer;
        let cert: Buffer;
        try {
          key = readFileSync(httpConfig.sslKeyPath);
          cert = readFileSync(httpConfig.sslCertPath);
        } catch (readError: any) {
          throw new Error(`Falha ao ler os arquivos de certificado/chave SSL: ${readError.message}`);
        }
        httpServer = createHttpsServer({ key, cert }, requestHandler);
      } else {
        httpServer = createHttpServer(requestHandler);
      }

      await new Promise<void>((resolve, reject) => {
        httpServer!.listen(httpConfig.port, httpConfig.host, () => {
          const protocol = isHttps ? 'https' : 'http';
          console.error(`Servidor MCP ouvindo em ${protocol}://${httpConfig.host}:${httpConfig.port}${httpConfig.path}`);
          resolve();
        });
        httpServer!.on('error', reject);
      });
    }

    console.error("Servidor MCP conectado e pronto!");
    console.error("Ferramentas disponíveis:", [
      "oracle_health_check",
      "oracle_query",
      "oracle_execute",
      "oracle_list_tables",
      "oracle_describe_table",
      "oracle_transaction",
      "oracle_info",
      "oracle_resumo_programacao_leite"
    ]);

  } catch (error) {
    console.error("Erro ao iniciar o servidor:", error);
    console.error("Stack trace:", (error as Error).stack);
    process.exit(1);
  }
}

// Limpeza ao sair
async function shutdown(): Promise<void> {
  console.error('Encerrando servidor...');
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
  }

  if (oracleService) {
    await oracleService.close();
  }

  try {
    await server.close();
  } catch (error: any) {
    console.error('Erro ao fechar o servidor MCP:', error.message || error);
  }
}

process.on('SIGINT', async () => {
  console.error('Recebido SIGINT, limpando...');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Recebido SIGTERM, limpando...');
  await shutdown();
  process.exit(0);
});

// Exportar funções para uso em testes e controle programático
export { runServer, shutdown, server };

// Iniciar o servidor automaticamente por padrão. Para evitar auto-start em testes,
// defina `MCP_AUTO_START=false` no ambiente antes de importar este módulo.
if (process.env.MCP_AUTO_START !== 'false') {
  runServer();
}