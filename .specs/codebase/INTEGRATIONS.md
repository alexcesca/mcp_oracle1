# Integracoes

## Banco de Dados Oracle

### Finalidade

Fonte primaria de dados e alvo de execucao para todas as operacoes SQL/PLSQL.

### Pontos de Integracao

- Driver: `oracledb`
- Camada de servico: `tools/oracle-service.ts`
- Pool de conexoes: `oracledb.createPool`
- Verificacoes de sessao e versao em `healthCheck`
- Consultas de metadados nas views do dicionario de dados Oracle:
  - `all_tables`
  - `all_tab_comments`
  - `all_tab_columns`
  - `all_col_comments`

### Superficie de Configuracao

- Credenciais de host/servico ou `ORACLE_CONNECTION_STRING` completo
- Ajuste do pool: min/max/increment/timeout
- Ajuste de fetch e cache de statements
- Chave de compatibilidade legada:
  - `ORACLE_OLD_CRYPTO=true` habilita o caminho de compatibilidade em modo thick
  - `ORACLE_CLIENT_LIB_DIR` opcional

## Autenticacao MCP (Bearer Token)

### Finalidade

Controlar acesso ao servidor MCP por meio de API keys, em conformidade com MCP Spec 2025-03-26 §Authorization e RFC 6750.

### Pontos de Integracao

- Middleware: `common/auth.ts` — logica completa de autenticacao e rate limiting
- Aplicado em: `index.ts:requestHandler` — intercepta todas as rotas exceto `OPTIONS` e `/.well-known/oauth-authorization-server`
- Configuracao do cliente: `.vscode/mcp.json` — header `Authorization: Bearer <key>`
- Gerador de chaves: `scripts/generate-key.mjs`

### Variaveis de Ambiente

| Variavel | Descricao | Padrao |
|---|---|---|
| `MCP_AUTH_ENABLED` | Habilitar/desabilitar autenticacao | `true` |
| `MCP_API_KEYS` | Hashes SHA-256 separados por virgula | — |
| `MCP_API_KEYS_PLAIN` | Chaves plain-text (hasheadas no startup) | — |
| `MCP_RATE_LIMIT_WINDOW_MS` | Janela de rate limit em ms | `60000` |
| `MCP_RATE_LIMIT_MAX` | Max requisicoes por janela por IP | `100` |
| `MCP_RATE_LIMIT_BLOCK_MS` | Duracao do bloqueio pos-limite em ms | `300000` |

### Propriedades de Seguranca

- Chaves armazenadas somente como SHA-256 hex — jamais em texto simples
- Comparacao timing-safe via `node:crypto.timingSafeEqual`
- Rate limiting in-memory por IP com limpeza periodica (`.unref()`)
- Fail-safe: auth habilitada + sem chaves → 503 (nunca falha aberta)
- Endpoint publico de discovery OAuth: `GET /.well-known/oauth-authorization-server` (RFC 8414)

## SDK MCP (Model Context Protocol)

### Finalidade

Expor capacidades Oracle como ferramentas MCP para clientes compativeis.

### Pontos de Integracao

- `McpServer`
- `StreamableHTTPServerTransport`
- Registro de ferramentas via `server.tool(...)`

### Ferramentas Expostas

- health check, SQL de leitura/escrita, descoberta de metadados, helper de transacao, informacoes de configuracao e ferramenta de agregacao de leite especifica do dominio.

## Rede HTTP/SSE

### Finalidade

Transporte MCP sobre HTTP/SSE.

### Pontos de Integracao

- Servidor Node `http` em `index.ts`
- Roteador de caminho/metodo para endpoint MCP
- Validacao de Origin para requisicoes de entrada

## Runtime de Container

### Finalidade

Execucao portavel do servidor e padronizacao do ambiente local.

### Pontos de Integracao

- `Dockerfile` instala Oracle Instant Client e dependencias da aplicacao.
- `docker-compose.yml` define dois servicos:
  - modo stdio
  - modo http na porta 3100

## Ferramentas de Build e Execucao

- Compilacao TypeScript e emissao de declaracoes (`tsc`)
- Execucao TypeScript em runtime (`tsx`) para scripts de dev/start
- Integracao com inspector usando `@modelcontextprotocol/inspector`

## Dependencias Externas em Tempo de Teste

- OpenSSL necessario no teste de transporte HTTPS para gerar certificados autoassinados.
- Pilha de rede usada localmente para testes de endpoint HTTP/HTTPS em loopback.
