# Testes

Analisado em: 2026-06-02

## Pilha de Testes

- Framework: Jest (`jest` + `ts-jest`)
- Ambiente: Node
- Descoberta de testes: `**/tests/**/*.test.ts`
- Timeout padrao: 30s
- Comando principal: `npm test`

## Categorias de Teste Existentes

### Testes unitarios de dominio

- Arquivo: `tests/leite-aggregation.test.ts`
- Escopo:
  - resolucao de periodo (default e validacoes)
  - validacao de allowlist para soma/agrupamento/filtro
  - assercoes de SQL com colunas fisicas mapeadas

### Testes unitarios de guardrails SQL

- Arquivo: `tests/sql-readonly-classification.test.ts`
- Escopo:
  - classificacao read-only para `WITH + SELECT`
  - bloqueio para `WITH + INSERT/DELETE`
  - bloqueio para DML direto (`UPDATE`)

### Testes de configuracao de transporte

- Arquivo: `tests/session-mode-config.test.ts`
- Escopo:
  - valor padrao de `MCP_SESSION_MODE`
  - normalizacao de caixa/espacos
  - erro explicito para valor invalido

### Testes de integracao (transporte HTTP)

- Arquivo: `tests/http-transport.test.ts`
- Escopo:
  - inicializacao do servidor em HTTP/SSE
  - handshake JSON-RPC
  - fluxo POST com sessao MCP

### Testes de integracao (servico Oracle)

- Arquivo: `tests/integration.test.ts`
- Escopo:
  - health check
  - consulta basica
  - listagem de tabelas
  - falha para SQL invalido
- Observacao:
  - a suite e marcada como `describe.skip` quando nao ha configuracao Oracle, evitando falso positivo.

## Status Atual de Execucao

Comando executado:

- `npm test -- --runInBand`

Resultado observado:

- Suites: 1 skipped, 4 passed, 4 of 5 total
- Testes: 4 skipped, 16 passed, 20 total
- Falhas: nenhuma

## Riscos e Limites Atuais

- Os testes de integracao Oracle permanecem dependentes de ambiente externo e credenciais.
- Em execucao sem Oracle configurado, a suite valida sem conectividade real (comportamento esperado via skip).

## Melhorias Futuras Recomendadas

- Incluir testes de contrato para handlers de tools em `tools/register-tools.ts`.
- Adicionar casos para SQL com wrappers menos comuns (subqueries mais complexas) na classificacao read-only.
- Criar fixture/integracao controlada para reduzir dependencia de ambiente Oracle real.
