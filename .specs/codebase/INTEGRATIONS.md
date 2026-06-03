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
