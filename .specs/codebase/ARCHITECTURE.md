# Arquitetura

Padrao: Monolito modular (servidor MCP de processo unico com modulos em camadas)

## Estrutura de Alto Nivel

- Ponto de entrada (`index.ts`): inicializa o servidor MCP em StreamableHTTP sobre HTTP/SSE, gerencia ciclo de vida e desligamento.
- Registro de ferramentas (`tools/register-tools.ts`): declara ferramentas MCP, schemas de entrada e formatacao de resposta.
- Camada de servico (`tools/oracle-service.ts`): encapsula inicializacao do cliente Oracle, pooling, execucao de consulta/comando e consultas de metadados.
- Camada de dominio/helper (`common/*.ts`): logica auxiliar segura para SQL, resolucao de periodo, construtor de consulta de agregacao com allowlist, logger com niveis e tipos compartilhados.

## Fluxo Principal de Execucao

1. O processo inicia em `index.ts`.
2. `McpServer` e criado com nome e versao.
3. `registerAllTools` registra cada ferramenta com schema de entrada Zod.
4. A primeira chamada de ferramenta inicializa `OracleService` de forma lazy.
5. `OracleService` carrega configuracao de ambiente e inicializa node-oracledb.
6. O handler da ferramenta chama um metodo de servico (`executeQuery`, `executeCommand`, `getTables`, etc.).
7. O servico obtem uma conexao do pool, executa SQL, mapeia resultado e fecha a conexao.
8. O handler da ferramenta formata o texto de resposta para o cliente MCP.

## Arquitetura de Transporte

### Modo HTTP + SSE

- Usa `StreamableHTTPServerTransport`.
- O servidor valida caminho, metodo e cabecalho `Origin`.
- Metodos suportados no caminho MCP:
  - `POST`: payload JSON-RPC
  - `GET` e `DELETE`: delegados ao handler de transporte MCP

## Padrao de Ferramentas

Cada ferramenta em `register-tools.ts` segue a mesma estrutura:

1. Validar schema de entrada com Zod.
2. Guardrails opcionais (exemplo: `oracle_query` permite apenas SQL de leitura).
3. Chamar metodo de servico.
4. Formatar texto de saida especifico do dominio.
5. Retornar resposta MCP com `content` ou `isError`.

Observacao de robustez:

- O guardrail de leitura em `common/utils.ts` foi reforcado para impedir que consultas iniciadas com `WITH` mas contendo palavras-chave de escrita/DDL sejam tratadas como somente leitura.

Conjunto atual de ferramentas:

- `oracle_health_check`
- `oracle_query`
- `oracle_info`
- `oracle_resumo_programacao_leite`

## Fluxo Especifico de Dominio: Resumo Programacao Leite

1. Resolver periodo (`resolvePeriod`): datas explicitas ou mes atual por padrao.
2. Limpar tabela alvo (`DELETE FROM resumo_programacao_leite_obi`).
3. Executar pacote PL/SQL (`PK_LAC_OBI.PKB_GERA_PROGLEI`).
4. Validar codigo/mensagem de erro de out bind.
5. Montar SQL de agregacao apenas com campos da allowlist.
6. Consultar dados agregados e formatar saida como tabela/JSON.

Esse fluxo e protegido por allowlists em `common/leite-aggregation.ts` para evitar injecao arbitraria de colunas SQL.

## Tratamento de Dados e Erros

- A execucao de SQL retorna wrappers `OracleResult<T>` normalizados.
- O servico mapeia erros Oracle de baixo nivel para mensagens amigaveis via `createFriendlyErrorMessage`.
- Conexoes sao sempre fechadas em blocos `finally`.
- O pool e singleton por instancia de processo e e fechado no shutdown.
- O bootstrap usa logger com nivel configuravel para reduzir ruido em testes e manter visibilidade operacional fora de `NODE_ENV=test`.

## Organizacao do Codigo

Abordagem: Em camadas por responsabilidade

- Transporte/boot: `index.ts`
- Camada de interface de ferramentas MCP: `tools/register-tools.ts`
- Camada de integracao DB: `tools/oracle-service.ts`
- Camada compartilhada de dominio/utilitarios: `common/*`
- Testes: `tests/*`
