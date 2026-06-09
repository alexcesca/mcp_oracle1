# Preocupacoes

Analisado em: 2026-06-09

## Alta Prioridade

Sem preocupacoes ativas de alta prioridade nesta reavaliacao.

### Resolvidas nesta rodada

7. Servidor MCP sem autenticacao expunha todas as ferramentas Oracle sem controle de acesso.
   - Evidencia: `common/auth.ts` implementa Bearer Token (RFC 6750), hash SHA-256, comparacao timing-safe, rate limiting por IP e fail-safe 503. `index.ts` aplica o middleware em todas as rotas protegidas. 24/24 testes unitarios passando em `tests/auth.test.ts`.

### Resolvidas em rodadas anteriores

1. Teste unitario de agregacao de leite alinhado ao SQL mapeado.
   - Evidencia: `tests/leite-aggregation.test.ts` agora valida colunas fisicas (`CD_UNID_ORIG`, `FORN_ID_ORIG`, `TOT_REAL_DEST`, `QTDE_PROG`) e passou na execucao local.
2. Testes de integracao Oracle com semantica explicita de skip e sem falso positivo.
   - Evidencia: `tests/integration.test.ts` usa `describe.skip` quando falta configuracao e, quando executado, exige sucesso real nas assercoes.
3. Protecao contra DNS rebinding ativada no transporte HTTP Streamable.
   - Evidencia: `index.ts` agora usa `enableDnsRebindingProtection: true` e os testes de transporte HTTP/HTTPS seguem passando.
4. Parse de `MCP_SESSION_MODE` endurecido com validacao estrita e teste de regressao.
   - Evidencia: `index.ts` agora rejeita valores invalidos (em vez de fallback silencioso para `stateful`) e `tests/session-mode-config.test.ts` cobre esse comportamento.
5. Logging pesado de startup reduzido com logger com nivel configuravel.
   - Evidencia: `common/logger.ts` introduz niveis `debug/info/error`; em `NODE_ENV=test` apenas `error` aparece; em producao `info` e ativado. Todos os `console.error` de startup em `index.ts` foram migrados para `logger.info`.
6. Classificacao de SQL read-only fortalecida para consultas `WITH`.
   - Evidencia: `common/utils.ts` agora trata `WITH` com palavras-chave de escrita/DDL como nao somente leitura; `tests/sql-readonly-classification.test.ts` cobre `WITH + SELECT` (permitido) e `WITH + INSERT/DELETE` (bloqueados).

## Media Prioridade

Sem preocupacoes ativas de media prioridade nesta reavaliacao.

## Baixa Prioridade

Sem preocupacoes ativas de baixa prioridade nesta reavaliacao.

## Acoes Priorizadas Recomendadas

Nenhuma acao pendente no momento. Manter monitoramento nas proximas mudancas de parser SQL.
