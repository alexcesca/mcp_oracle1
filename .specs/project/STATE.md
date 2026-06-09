# Project State

**Projeto:** MCP Oracle DB Server  
**Última atualização:** 2026-06-09

---

## Decisões

| Data | Decisão | Razão | Alternativas Rejeitadas |
|---|---|---|---|
| 2026-06-08 | Usar SHA-256 hash de API keys em vez de chaves em texto simples | Vazamento do `.env` não expõe as credenciais originais | bcrypt (overhead desnecessário para chaves aleatórias), JWT (complexidade sem ganho para use-case) |
| 2026-06-08 | Rate limiting in-memory (sem Redis) | Servidor é single-process; reinicializações limpam o estado — comportamento aceitável para o cenário de uso | Redis/Valkey (dependência externa desnecessária) |
| 2026-06-08 | Bearer Token (RFC 6750) como mecanismo primário | Compatível com MCP Spec 2025-03-26 §Authorization; suporte nativo em clientes MCP e VS Code | API key em query string (expõe em logs), cookie (não suportado por clientes MCP) |
| 2026-06-08 | `MCP_AUTH_ENABLED=false` permite desabilitar auth | Facilita desenvolvimento local sem necessidade de configurar chaves | Sempre obrigatório (bloqueia ambientes de dev sem configuração) |
| 2026-06-08 | Fail-safe 503 quando auth habilitada e sem chaves | OWASP: falhar de forma segura — nunca falha aberta | Logar aviso e permitir (seria falha aberta) |
| 2026-06-08 | OPTIONS (preflight CORS) isento de autenticação | Browsers enviam preflight antes do Bearer Token; bloquear quebraria clientes web | N/A |

---

## Lições Aprendidas

- **Docker e variáveis de ambiente:** `docker compose up --build` reconstrói a imagem mas não recria o container com o `.env` atualizado. É necessário `docker compose up -d` (sem `--build`) após alterar o `.env` para que as novas variáveis sejam injetadas.
- **Timing attacks em comparação de secrets:** Usar `timingSafeEqual` do Node.js nativo é suficiente para comparação de hashes SHA-256. Comparar as hashes (não as chaves originais) equaliza o comprimento dos buffers, simplificando a implementação.
- **Timer de limpeza do rate limit:** Usar `.unref()` no `setInterval` é essencial — sem isso, o timer impede que o processo Node.js encerre naturalmente em testes.

---

## Funcionalidades Implementadas

| Feature | Spec | Status |
|---|---|---|
| Análise de brownfield (codebase mapping) | `.specs/codebase/` | ✅ Completo |
| Autenticação MCP (Bearer Token + Rate Limiting) | `.specs/features/mcp-auth/spec.md` | ✅ Completo |

---

## Deferred / Ideas

- **Renovação automática de chaves:** Implementar rotação programada com notificação (webhooks/log estruturado) quando uma chave está próxima de expirar. Requer introdução de metadados (data de criação) junto ao hash.
- **Audit log estruturado de autenticação:** Log de cada autenticação bem-sucedida/falhada em formato JSON para ingestão em SIEM.
- **Limite de chaves por ferramenta:** Permitir que certas API keys tenham acesso apenas a um subconjunto de ferramentas MCP (escopos).
- **Rate limit persistente:** Migrar o store in-memory para Redis para sobreviver a reinicializações — relevante se o servidor for escalado horizontalmente.

---

## Preocupações Ativas

Nenhuma preocupação de alta prioridade no momento. Ver `.specs/codebase/CONCERNS.md` para histórico completo.
