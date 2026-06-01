# Testes

Analisado em: 2026-06-01

## Pilha de Testes

- Framework: Jest (`jest` + `ts-jest`)
- Ambiente: Node
- Descoberta de testes: `**/tests/**/*.test.ts`
- Timeout padrao: 30s
- Fontes de cobertura:
  - `tools/**/*.ts`
  - `common/**/*.ts`
  - `index.ts`

## Categorias de Teste Existentes

### Testes unitarios

- Arquivo: `tests/leite-aggregation.test.ts`
- Escopo:
  - resolucao de periodo (padroes e validacao)
  - validacao de allowlist para campos de soma/agrupamento/filtro
  - assercoes de geracao SQL

### Testes de integracao (transporte)

- Arquivo: `tests/http-transport.test.ts`
- Escopo:
  - inicia servidor com HTTP/SSE e HTTPS/SSE
  - verifica fluxo de inicializacao JSON-RPC
  - verifica chamada de tool via POST com cabecalho de sessao MCP
  - gera certificado autoassinado temporario para o caminho HTTPS

### Testes de integracao (servico Oracle)

- Arquivo: `tests/integration.test.ts`
- Escopo:
  - health check
  - consulta basica
  - listagem de tabelas
  - comportamento para SQL invalido
- Observacao de comportamento:
  - os testes sao efetivamente ignorados quando o ambiente Oracle nao esta disponivel; mesmo assim passam porque as assercoes sao puladas.

## Status Atual de Execucao

Comando executado:

- `npm test -- --runInBand`

Resultado observado:

- Suites de teste: 1 falhou, 2 passaram, 3 no total
- Testes: 1 falhou, 12 passaram, 13 no total

Detalhes da falha:

- Arquivo com falha: `tests/leite-aggregation.test.ts`
- Caso com falha: as strings SQL esperadas usam nomes antigos de coluna (`QUANTIDADE_TOTAL_ENTREGUE`, `QUANTIDADE_PROGRAMADA`), enquanto a implementacao atual mapeia para `TOT_REAL_DEST` e `QTDE_PROG`.
- Divergencia adicional: era esperado `GROUP BY UNIDADE, FORNECEDOR`, mas o SQL agrupa por colunas fisicas (`CD_UNID_ORIG`, `FORN_ID_ORIG`) mais a coluna complementar (`NOME_ORIG`).

## Lacunas e Riscos no Desenho de Testes

- Testes de integracao Oracle podem gerar falso positivo quando o ambiente nao esta configurado, pois fazem log-e-return em vez de marcar explicitamente como skip.
- O teste de SQL invalido atualmente usa `SELECT 1 FROM dual` (SQL valido), entao o caminho de falha pretendido nao e realmente validado quando Oracle esta disponivel.
- Testes de transporte geram ruido por causa do uso intenso de `console.error` na inicializacao do servidor.

## Proximas Melhorias Recomendadas

- Alinhar as expectativas de `tests/leite-aggregation.test.ts` com o comportamento atual de mapeamento SQL.
- Substituir log-e-return por semantica explicita de skip no Jest, ou por blocos describe condicionados por ambiente.
- Corrigir o caso de SQL invalido para uma instrucao realmente invalida.
- Adicionar testes direcionados para orquestracao em nivel de tool de `oracle_resumo_programacao_leite` e tratamento de erro de out bind.
