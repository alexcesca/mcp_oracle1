# Estrutura do Projeto

Raiz: /home/alex/Oracle/Mcp/mcp-oracle-db/mcp_oracle1

## Arvore de Diretorios (ate 3 niveis)

- `common/`
  - `logger.ts`
  - `leite-aggregation.ts`
  - `types.ts`
  - `utils.ts`
  - `version.ts`
- `tools/`
  - `oracle-service.ts`
  - `register-tools.ts`
- `tests/`
  - `http-transport.test.ts`
  - `integration.test.ts`
  - `leite-aggregation.test.ts`
  - `session-mode-config.test.ts`
  - `sql-readonly-classification.test.ts`
- `types/`
  - `oracledb.d.ts`
- Arquivos de runtime/configuracao na raiz
  - `index.ts`
  - `package.json`
  - `tsconfig.json`
  - `jest.config.js`
  - `Dockerfile`
  - `docker-compose.yml`
  - `README.md`
  - `INSTRUCOES DE INSTALACAO.md`

## Organizacao dos Modulos

### Inicializacao do Servidor

- Finalidade: inicializar o servidor MCP e selecionar o modo de transporte.
- Localizacao: `index.ts`
- Responsabilidades principais:
  - resolucao de configuracao de transporte com base em variaveis de ambiente
  - tratamento de requisicoes HTTP/HTTPS
  - validacao de origin
  - encerramento gracioso

### Camada de Integracao Oracle

- Finalidade: isolar todas as interacoes com o Oracle DB e o pool de conexoes.
- Localizacao: `tools/oracle-service.ts`
- Responsabilidades principais:
  - carregar configuracao de ambiente
  - inicializar node-oracledb
  - criar e gerenciar pool de conexoes
  - executar consultas e comandos
  - ler metadados de schema (tabelas/colunas)

### Camada de Interface de Tools MCP

- Finalidade: expor capacidades Oracle como tools MCP com schemas.
- Localizacao: `tools/register-tools.ts`
- Responsabilidades principais:
  - registro de tools
  - validacao de argumentos
  - formatacao de respostas voltadas ao usuario
  - orquestracao para o fluxo de dominio `oracle_resumo_programacao_leite`

### Camada Compartilhada de Dominio e Utilitarios

- Finalidade: formatacao reutilizavel, helpers de SQL e contratos tipados.
- Localizacao: `common/*.ts`
- Arquivos principais:
  - `common/logger.ts`: logger com nivel configuravel por ambiente (`debug/info/error`)
  - `common/leite-aggregation.ts`: construtor de SQL de agregacao baseado em allowlist
  - `common/utils.ts`: helpers de classificacao SQL, formatacao e sanitizacao
  - `common/types.ts`: interfaces normalizadas de resultado e modelo
  - `common/version.ts`: constante exportada da versao do servidor

### Sobrescritas de Tipos

- Finalidade: augmentation local para tipagens de `oracledb` usadas no projeto.
- Localizacao: `types/oracledb.d.ts`

### Camada de Testes

- Finalidade: validar logica de helpers e comportamento MCP em nivel de transporte.
- Localizacao: `tests/*.test.ts`
