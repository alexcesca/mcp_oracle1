# MCP Authentication — Especificação

**Feature:** Autenticação de Acesso ao Servidor MCP  
**Status:** ✅ Implementado e Verificado  
**Implementado em:** 2026-06-08  
**Referências normativas:** MCP Spec 2025-03-26 §Authorization · RFC 6750 · RFC 8414 · OWASP API Security Top 10

---

## Problem Statement

O servidor MCP Oracle DB expunha todas as suas ferramentas sem qualquer controle de acesso. Qualquer processo capaz de alcançar a porta HTTP podia executar queries, listar tabelas e acionar procedimentos PL/SQL no banco Oracle de produção. O objetivo desta feature é garantir que somente clientes autorizados — portando uma chave de API válida — possam interagir com o servidor.

## Goals

- [x] Rejeitar requisições sem credencial válida antes de qualquer processamento MCP
- [x] Nunca armazenar chaves de API em texto simples (somente hash SHA-256)
- [x] Prevenir ataques de força-bruta com rate limiting por IP
- [x] Ser compatível com o protocolo de autenticação do MCP Spec 2025-03-26
- [x] Falhar de forma segura: auth habilitada + zero chaves configuradas → rejeição total (503)
- [x] Não introduzir dependências externas além do módulo nativo `node:crypto`

## Out of Scope

| Feature | Razão |
|---|---|
| OAuth 2.0 Authorization Code flow completo | Fora do escopo de um servidor de uso interno; apenas o discovery endpoint foi exposto |
| JWT / tokens com expiração | Desnecessário para o caso de uso de API key estática |
| Rotação automática de chaves | O operador rotaciona manualmente via `npm run generate-key` |
| Persistência de sessão autenticada | Cada requisição é autenticada individualmente (stateless) |
| Autenticação de usuário final (OAuth PKCE) | Clientes MCP são processos de sistema, não usuários humanos |

---

## User Stories

### P1: Autenticação via Bearer Token ⭐ MVP

**User Story:** Como operador do servidor MCP, quero que todas as requisições exijam um Bearer Token válido para que apenas clientes autorizados acessem as ferramentas Oracle.

**Acceptance Criteria:**

1. WHEN a requisição inclui `Authorization: Bearer <chave-válida>` THEN o servidor SHALL prosseguir normalmente
2. WHEN a requisição não inclui nenhum header de autenticação THEN o servidor SHALL retornar HTTP 401 com `WWW-Authenticate: Bearer realm="oracle-db-mcp-server"`
3. WHEN a requisição inclui uma chave inválida THEN o servidor SHALL retornar HTTP 403
4. WHEN a requisição inclui `x-api-key: <chave-válida>` THEN o servidor SHALL aceitar como alternativa ao Bearer Token

**Independent Test:** `curl -s http://localhost:3100/mcp` → 401; `curl -H "Authorization: Bearer <key>" http://localhost:3100/mcp` → SSE stream abre

---

### P1: Armazenamento Seguro de Chaves ⭐ MVP

**User Story:** Como operador, quero que as chaves de API nunca sejam armazenadas ou comparadas em texto simples para que um vazamento do arquivo `.env` não exponha as credenciais originais.

**Acceptance Criteria:**

1. WHEN uma chave é configurada via `MCP_API_KEYS` THEN o servidor SHALL aceitar somente o formato hash SHA-256 hex de 64 chars
2. WHEN uma chave é configurada via `MCP_API_KEYS_PLAIN` THEN o servidor SHALL hashear na inicialização e descartar o valor original
3. WHEN a comparação de chaves é realizada THEN o servidor SHALL usar `timingSafeEqual` para prevenir timing attacks
4. WHEN o operador solicita uma nova chave THEN `npm run generate-key` SHALL emitir a API Key e seu SHA-256 separadamente

**Independent Test:** Inspecionar `.env` — contém apenas hash, nunca a chave; `npm run generate-key` exibe as duas linhas distintas

---

### P1: Rate Limiting por IP ⭐ MVP

**User Story:** Como operador, quero que IPs que fizerem muitas requisições em curto período sejam bloqueados temporariamente para prevenir ataques de força-bruta.

**Acceptance Criteria:**

1. WHEN um IP excede `MCP_RATE_LIMIT_MAX` requisições dentro da janela `MCP_RATE_LIMIT_WINDOW_MS` THEN o servidor SHALL retornar HTTP 429 com header `Retry-After`
2. WHEN um IP está bloqueado THEN o servidor SHALL manter o bloqueio por `MCP_RATE_LIMIT_BLOCK_MS` milissegundos
3. WHEN a janela de rate limit expira THEN o servidor SHALL resetar o contador do IP
4. WHEN o servidor é reiniciado THEN o estado de rate limit SHALL ser resetado (stateless entre reinicializações — comportamento documentado)

**Independent Test:** Suite `auth – authenticateRequest` → teste "retorna 429 após exceder rate limit" ✓

---

### P1: Fail-Safe na Misconfiguration ⭐ MVP

**User Story:** Como operador, quero que o servidor nunca permita acesso irrestrito por falha de configuração — se auth está habilitada mas nenhuma chave foi definida, todas as requisições devem ser rejeitadas.

**Acceptance Criteria:**

1. WHEN `MCP_AUTH_ENABLED=true` (padrão) e nenhuma chave está configurada THEN o servidor SHALL retornar HTTP 503 em toda requisição
2. WHEN `MCP_AUTH_ENABLED=false` THEN o servidor SHALL processar requisições sem autenticação e SHALL logar aviso de segurança no startup
3. WHEN o servidor inicia com chaves configuradas THEN o log SHALL exibir contagem de chaves (nunca os valores)

**Independent Test:** Suite `auth – authenticateRequest` → teste "retorna 503 quando auth habilitada mas sem chaves configuradas" ✓

---

### P2: Discovery OAuth Metadata

**User Story:** Como desenvolvedor de cliente MCP, quero poder consultar `/.well-known/oauth-authorization-server` para descobrir as capacidades de autenticação do servidor, conforme MCP Spec 2025-03-26.

**Acceptance Criteria:**

1. WHEN `GET /.well-known/oauth-authorization-server` é chamado THEN o servidor SHALL retornar JSON conforme RFC 8414
2. WHEN o endpoint é consultado THEN a resposta SHALL incluir `issuer`, `token_endpoint`, `code_challenge_methods_supported: ["S256"]`
3. WHEN o endpoint é consultado THEN a rota SHALL ser pública (não exige autenticação)

**Independent Test:** Suite `auth – buildOAuthMetadata` → todos os testes ✓; `curl http://localhost:3100/.well-known/oauth-authorization-server` sem Bearer → JSON retornado

---

### P2: Rotação de Chaves

**User Story:** Como operador, quero poder adicionar e remover chaves de API sem downtime para que eu possa rotacionar credenciais sem interromper clientes em uso.

**Acceptance Criteria:**

1. WHEN múltiplos hashes são definidos em `MCP_API_KEYS` (separados por vírgula) THEN o servidor SHALL aceitar qualquer uma das chaves correspondentes
2. WHEN uma chave é removida do `MCP_API_KEYS` e o container é reiniciado THEN requisições com essa chave SHALL ser rejeitadas

**Independent Test:** Definir dois hashes no `.env`, fazer duas requisições com chaves distintas — ambas retornam sucesso

---

## Edge Cases

- WHEN `Authorization: Bearer ` está presente mas a chave está vazia THEN SHALL retornar 401
- WHEN `MCP_API_KEYS` contém um valor que não é SHA-256 hex válido (≠ 64 chars hexadecimais) THEN a entrada SHALL ser ignorada com log de aviso
- WHEN `MCP_API_KEYS_PLAIN` contém chave com menos de 16 caracteres THEN SHALL ser ignorada com log de erro
- WHEN `OPTIONS` (preflight CORS) é recebido THEN auth SHALL ser ignorada (retorna 204 direto)
- WHEN `x-forwarded-for` está presente (proxy reverso) THEN o IP de rate limit SHALL ser o primeiro endereço da lista
- WHEN o servidor é reiniciado THEN o timer de limpeza do rate limit store SHALL ser reiniciado via `.unref()` (não segura o processo)

---

## Requirement Traceability

| ID | Descrição | Story | Arquivo | Status |
|---|---|---|---|---|
| AUTH-01 | Bearer Token via `Authorization` header | P1: Bearer Token | `common/auth.ts:extractApiKey` | ✅ Verificado |
| AUTH-02 | Alternativa `x-api-key` header | P1: Bearer Token | `common/auth.ts:extractApiKey` | ✅ Verificado |
| AUTH-03 | Hash SHA-256 de chaves (MCP_API_KEYS) | P1: Armazenamento Seguro | `common/auth.ts:parseAuthConfig` | ✅ Verificado |
| AUTH-04 | Hash na inicialização (MCP_API_KEYS_PLAIN) | P1: Armazenamento Seguro | `common/auth.ts:parseAuthConfig` | ✅ Verificado |
| AUTH-05 | Comparação timing-safe (`timingSafeEqual`) | P1: Armazenamento Seguro | `common/auth.ts:safeStringEqual` | ✅ Verificado |
| AUTH-06 | Rate limit por IP com janela configurável | P1: Rate Limiting | `common/auth.ts:checkRateLimit` | ✅ Verificado |
| AUTH-07 | HTTP 429 + `Retry-After` ao exceder limite | P1: Rate Limiting | `common/auth.ts:sendAuthError` | ✅ Verificado |
| AUTH-08 | Fail-safe 503 sem chaves configuradas | P1: Fail-Safe | `common/auth.ts:authenticateRequest` | ✅ Verificado |
| AUTH-09 | `MCP_AUTH_ENABLED=false` desabilita auth | P1: Fail-Safe | `common/auth.ts:authenticateRequest` | ✅ Verificado |
| AUTH-10 | HTTP 401 com `WWW-Authenticate` (RFC 6750) | P1: Bearer Token | `common/auth.ts:sendAuthError` | ✅ Verificado |
| AUTH-11 | Discovery `/.well-known/oauth-authorization-server` | P2: OAuth Metadata | `index.ts:requestHandler` | ✅ Verificado |
| AUTH-12 | Múltiplas chaves simultâneas (rotação) | P2: Rotação | `common/auth.ts:authenticateRequest` | ✅ Verificado |
| AUTH-13 | Script `npm run generate-key` | P1: Armazenamento Seguro | `scripts/generate-key.mjs` | ✅ Verificado |
| AUTH-14 | Header de auth em `mcp.json` do cliente | P1: Bearer Token | `.vscode/mcp.json` | ✅ Verificado |

**Coverage:** 14 total · 14 verificados · 0 pendentes

---

## Success Criteria

- [x] Requisição sem Bearer Token retorna 401 com `WWW-Authenticate`
- [x] Chave válida permite acesso normal ao SSE stream MCP
- [x] Chave inválida retorna 403
- [x] Rate limiting bloqueia IPs abusivos com 429
- [x] Misconfiguration retorna 503 (nunca falha aberta)
- [x] 24/24 testes unitários passando (`tests/auth.test.ts`)
- [x] Zero erros TypeScript no módulo de auth
- [x] Container Docker carrega `MCP_API_KEYS` do `.env` corretamente
