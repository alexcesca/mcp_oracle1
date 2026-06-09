# Construindo um Servidor MCP em Node.js/TypeScript: Da Arquitetura ao Grounding de LLMs com a Tool `oracle_resumo_programacao_leite`

> **Público-alvo:** Desenvolvedores que já trabalham com Node.js/TypeScript e querem entender como integrar sistemas legados (Oracle, SAP, etc.) a LLMs de forma segura, determinística e auditável.

---

## 1. Por que MCP? O Problema Antes do Protocolo

Quando você conecta uma LLM a um sistema real, o problema imediato é: **como a LLM sabe o que pode chamar, quais parâmetros enviar e o que esperar de volta?**

Antes do [Model Context Protocol (MCP)](https://modelcontextprotocol.io), cada integração era um contrato artesanal: prompts de sistema descrevendo formatos JSON, parsers frágeis no cliente, zero validação de schema. O resultado era previsível — alucinações de parâmetros, chamadas com campos inválidos e uma experiência de debug que beirava o caos.

O **MCP** resolve isso com um protocolo padronizado, análogo ao que o LSP (Language Server Protocol) fez para editores de código. Ele define:

- Um mecanismo de **descoberta** de ferramentas (`tools/list`)
- Um mecanismo de **invocação** tipada (`tools/call`)
- Um formato de **resposta** estruturada que a LLM sabe interpretar
- Transporte via **JSON-RPC 2.0** sobre HTTP (Streamable HTTP) ou stdio

O projeto `@grec0/mcp-oracle-db` implementa um servidor MCP completo que expõe ferramentas de Oracle Database para uma LLM. A tool central deste artigo — `oracle_resumo_programacao_leite` — é um caso de uso real: executar um processo de negócio complexo (programação de leite OBI) com uma única chamada MCP, sem que o cliente LLM precise conhecer nada do Oracle por baixo.

---

## 2. Inicialização do Projeto e Stack de Decisões

### 2.1 O ponto de partida

```
.                                     ← novo: common/auth.ts
├── index.ts                     ← Entry point: HTTP server + McpServer + auth middleware
├── tools/
│   ├── oracle-service.ts        ← Abstração sobre oracledb
│   └── register-tools.ts        ← Registro de todas as tools no McpServer
├── common/
│   ├── auth.ts                  ← Bearer Token, SHA-256, rate limiting (RFC 6750)
│   ├── leite-aggregation.ts     ← Lógica de domínio: SQL dinâmico seguro
│   ├── logger.ts                ← Logger mínimo com controle de nível
│   ├── utils.ts                 ← Helpers: formatação, validação SQL
│   └── version.ts
├── scripts/
│   └── generate-key.mjs         ← Gerador de API keys + hash SHA-256
└── types/
    └── oracledb.d.ts
```

A separação é intencional: `register-tools.ts` declara **o contrato MCP** (o que a LLM vê), enquanto `leite-aggregation.ts` encapsula **a lógica de domínio** (o que o Oracle executa). Essa divisão facilita testar a lógica de negócio isolada do protocolo.

### 2.2 Stack principal e justificativas

#### `@modelcontextprotocol/sdk` — O backbone do protocolo

```bash
npm install @modelcontextprotocol/sdk   # v1.29.0
```

O SDK oficial do MCP oferece `McpServer` (abstração de alto nível) e `StreamableHTTPServerTransport` (transporte HTTP com suporte a SSE para streaming). Sem o SDK, você escreveria o codec JSON-RPC, o gerenciamento de sessão e o handler de `tools/list` manualmente.

A classe `McpServer` expõe um método `.tool()` que recebe:
1. **Nome** da tool (string snake_case)
2. **Descrição** em linguagem natural — esta é a frase que a LLM lê para decidir quando chamar a tool
3. **Schema Zod** dos argumentos de entrada
4. **Handler** assíncrono com a lógica de execução

```typescript
// index.ts — criação do servidor
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const server = new McpServer({
  name: "oracle-db-mcp-server",
  version: VERSION,
});
```

> **Referência:** [modelcontextprotocol.io/docs](https://modelcontextprotocol.io/docs) e [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)

---

#### `Zod` — Validação de schema como contrato de API

```bash
npm install zod   # v3.22.4
```

**Por que Zod e não JSON Schema puro?** Porque o MCP SDK aceita schemas Zod nativamente, e Zod oferece **inferência de tipos TypeScript em tempo de compilação** junto com **validação em tempo de execução** — dois por um.

Quando a LLM envia um `tools/call`, os argumentos chegam como JSON genérico. O SDK usa o schema Zod registrado para:

1. **Validar** os valores recebidos (tipos, ranges, enums)
2. **Inferir** o tipo TypeScript do objeto `args` dentro do handler, com autocompletion completo

Isso significa que um campo `somatorios: ["invalid_field"]` jamais chega ao handler — é rejeitado na camada do protocolo com uma resposta de erro estruturada antes mesmo do seu código rodar.

> **Referência:** [zod.dev](https://zod.dev)

---

#### `oracledb` — Driver Oracle nativo para Node.js

```bash
npm install oracledb   # v6.10.0
```

O driver oficial da Oracle para Node.js, com suporte a connection pooling, bind variables (proteção contra SQL injection), CLOB/BLOB, e chamadas de stored procedures com parâmetros `BIND_OUT`. Este último é crítico para a tool de leite: a procedure retorna códigos de erro e mensagens via parâmetros de saída PL/SQL.

---

## 3. Autenticacao MCP: Bearer Token com Fail-Safe

Antes de chegarmos ao core da tool de leite, vale entender a camada de segurança que protege todas as rotas do servidor. O projeto implementa autenticação conforme o [MCP Spec 2025-03-26 §Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization/) e RFC 6750.

### 3.1 Por que não armazenar a chave em texto simples?

O arquivo `.env` é facilmente vazável: logs de CI, backups, erros de permissão de arquivo. Se a chave estiver em texto simples no `.env`, um vazamento expõe a credencial diretamente. A solução é armazenar apenas o **hash SHA-256** da chave:

```bash
# O operador gera a chave e o hash
npm run generate-key
# Saida:
#   API Key   : lZR10ooMNjLr31UyLgBGm8XbBJOxpBBhGmyBKDnFc80
#   SHA-256   : 71e5853bdbc750bcecaf6d9b9d0dbee533470a74cac8ca8a0393add3ac1a4a19

# No .env do servidor: apenas o hash
MCP_API_KEYS=71e5853bdbc750bcecaf6d9b9d0dbee533470a74cac8ca8a0393add3ac1a4a19

# No .vscode/mcp.json do cliente: apenas a API Key original
# "Authorization": "Bearer lZR10ooMNjLr31UyLgBGm8XbBJOxpBBhGmyBKDnFc80"
```

Um vazamento do `.env` expõe somente o hash — computacionalmente inviável de reverter para a chave original (pré-imagem SHA-256).

### 3.2 Comparação timing-safe

Uma implementação naive de validação de segredos usa `===`, que interrompe a comparação no primeiro byte diferente. Um atacante com acesso a métricas de latência pode explorar essa variação de tempo para deduzir a chave byte a byte (timing attack). A proteção é usar `timingSafeEqual` do módulo nativo `node:crypto`:

```typescript
// common/auth.ts
import { timingSafeEqual, createHash } from 'node:crypto';

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    // Executa operação fictícia para igualar o tempo mesmo com tamanhos diferentes
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Na validação: comparamos hashes, nunca as chaves originais
const providedHash = createHash('sha256').update(providedKey, 'utf8').digest('hex');
for (const storedHash of config.apiKeyHashes) {
  if (safeStringEqual(providedHash, storedHash)) {
    return null; // autenticado
  }
}
```

### 3.3 Rate limiting e fail-safe

O middleware aplica rate limiting por IP antes da validação da chave — isso protege contra força-bruta mesmo quando a chave ainda não foi verificada:

```typescript
// Fluxo de autenticação em authenticateRequest()
const rateCheck = checkRateLimit(clientIp, config);
if (!rateCheck.allowed) {
  return { status: 429, error: 'Too Many Requests', retryAfter: rateCheck.retryAfter };
}

// Fail-safe: auth habilitada + sem chaves configuradas = 503, nunca falha aberta
if (config.apiKeyHashes.size === 0) {
  return { status: 503, error: 'Server misconfiguration: no API keys configured.' };
}
```

O comportamento fail-safe é deliberado: se o operador habilitar auth mas esquecer de configurar `MCP_API_KEYS`, o servidor rejeita **toda** requisição com 503. É mais seguro (e mais fácil de diagnosticar) do que silenciosamente permitir acesso irrestrito.

### 3.4 Integração no request handler

```typescript
// index.ts — middleware aplicado antes de qualquer rota MCP
const authConfig: AuthConfig = parseAuthConfig();

const requestHandler = async (req, res) => {
  // OPTIONS (preflight CORS) — isento de auth
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Discovery público (RFC 8414 / MCP Spec)
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    res.end(JSON.stringify(buildOAuthMetadata(baseUrl))); return;
  }

  // Autentica toda requisição restante
  const authError = authenticateRequest(req, authConfig);
  if (authError) {
    sendAuthError(res, authError); // inclui WWW-Authenticate em 401
    return;
  }

  // ... roteamento MCP normal
};
```

---

## 4. Registrando o Servidor HTTP com Controle de Sessão e CORS

Antes das tools, o servidor HTTP precisa estar configurado corretamente. O trecho abaixo mostra como o `index.ts` configura o transporte com proteção contra DNS rebinding e controle de origem:

```typescript
// index.ts — configuração do transporte HTTP
const transport = new StreamableHTTPServerTransport({
  // Em modo 'stateful', cada cliente recebe um UUID de sessão
  // Em 'stateless', não há rastreamento de sessão (ideal para escala horizontal)
  sessionIdGenerator: httpConfig.sessionMode === 'stateful'
    ? () => randomUUID()
    : undefined,
  allowedOrigins: httpConfig.allowedOrigins,  // CORS whitelist
  enableDnsRebindingProtection: true,          // Valida header Host
  retryInterval: 3000,
});

await server.connect(transport);
```

O modo `stateful` vs `stateless` é configurável via variável de ambiente `MCP_SESSION_MODE`. O padrão do projeto é `stateful` para que a LLM possa manter contexto de múltiplas chamadas em uma conversa — relevante quando ela precisa chamar `oracle_health_check` e depois `oracle_resumo_programacao_leite` na mesma sessão.

---

## 5. O Core do Artigo: Construindo a Tool `oracle_resumo_programacao_leite`

Esta tool encapsula um pipeline de negócio de três etapas em uma única chamada MCP. Vamos percorrê-la camada por camada.

### 5.1 O Schema Zod — O contrato que a LLM lê

```typescript
// tools/register-tools.ts
server.tool(
  "oracle_resumo_programacao_leite",

  // Esta string é o que a LLM lê para decidir QUANDO chamar esta tool.
  // Seja específico: a LLM usa isso como base de raciocínio.
  "Executa PK_LAC_OBI.PKB_GERA_PROGLEI e retorna somatórios da " +
  "programacao leite por agrupamentos permitidos",

  {
    // Período: ambos opcionais — se omitidos, usa o mês atual automaticamente
    dtInic: z.string().optional()
      .describe("Data inicial no formato YYYY-MM-DD"),
    dtFim: z.string().optional()
      .describe("Data final no formato YYYY-MM-DD"),

    // Identificadores do processo para rastreabilidade no Oracle
    sistema: z.string().optional().default("OBI")
      .describe("Identificação do sistema para a procedure"),
    processo: z.string().optional().default("MCP")
      .describe("Identificação do processo para a procedure"),

    // Enum estrito: a LLM só pode enviar valores desta lista
    somatorios: z.array(z.enum([
      "quantidade_total_entregue",
      "quantidade_prevista",
      "quantidade_programada"
    ])).min(1).describe(
      "Campos de somatório: quantidade_total_entregue=TOT_REAL_DEST, " +
      "quantidade_prevista=QTDE_PREV_DEST, quantidade_programada=QTDE_PROG"
    ),

    agruparPor: z.array(z.enum([
      "unidade",
      "fornecedor",
      "filiada",
      "posto",
      "produto_analisado"
    ])).min(1).describe(
      "Campos de agrupamento: unidade=CD_UNID_ORIG, fornecedor=FORN_ID_ORIG, " +
      "filiada=CD_FILI_ORIG, posto=CD_POSTO_ORIG, produto_analisado=DESCR_MATERANALI"
    ),

    filtros: z.record(z.string(), z.string()).optional()
      .describe("Filtros opcionais por dimensão permitida"),

    maxRows: z.number().int().min(1).max(1000).optional().default(200)
      .describe("Limite máximo de linhas"),

    formatAsTable: z.boolean().optional().default(true)
      .describe("Formatar resultado como tabela"),
  },

  async (args) => { /* handler */ }
);
```

**Observe os padrões de design no schema:**

- `z.enum([...])` em `somatorios` e `agruparPor` cria uma allowlist explícita. A LLM **não pode inventar** um campo como `"quantidade_retida"` — o schema rejeita antes do handler.
- `.min(1)` nos arrays garante que a LLM seja obrigada a escolher ao menos um somatório e um agrupamento.
- `.describe()` em cada campo é a documentação inline que o MCP expõe via `tools/list`. A LLM lê esses textos para entender como usar a tool.
- O mapeamento `nome_semantico → COLUNA_FISICA` no `.describe()` resolve um problema clássico: você não quer expor nomes de colunas internas do Oracle para a LLM, mas ela precisa entender o que cada campo significa.

---

### 5.2 Resolução de período — Validação no domínio, não no schema

O Zod valida tipos e formatos básicos. Mas a regra "se apenas uma data for informada, é erro" é uma **regra de negócio** — ela pertence ao domínio, não ao schema. Por isso existe `resolvePeriod`:

```typescript
// common/leite-aggregation.ts
export function resolvePeriod(
  dtInic?: string,
  dtFim?: string,
  referenceDate: Date = new Date()
): ResolvedPeriod {

  // Caso 1: nenhuma data → usa o mês atual automaticamente
  if (!dtInic && !dtFim) {
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate   = new Date(Date.UTC(year, month + 1, 0)); // último dia do mês

    return { startDate, endDate, startIso: formatDateIso(startDate),
             endIso: formatDateIso(endDate), usedDefaultMonth: true };
  }

  // Caso 2: apenas uma data → erro explícito
  if (!dtInic || !dtFim) {
    throw new Error("Informe os dois campos de período: 'dtInic' e 'dtFim'.");
  }

  // Caso 3: ambas informadas → validar formato e consistência
  const startDate = parseIsoDate(dtInic, 'dtInic');
  const endDate   = parseIsoDate(dtFim, 'dtFim');

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error("Período inválido: 'dtInic' deve ser menor ou igual a 'dtFim'.");
  }

  return { startDate, endDate, startIso: formatDateIso(startDate),
           endIso: formatDateIso(endDate), usedDefaultMonth: false };
}
```

Note o uso de `Date.UTC` para evitar ambiguidades de fuso horário — um bug clássico em sistemas que processam datas vindas de fora.

---

### 5.3 O handler em três etapas

```typescript
async (args) => {
  try {
    // ── ETAPA 1: Resolver o período ─────────────────────────────────────
    const period = resolvePeriod(args.dtInic, args.dtFim);

    // ── ETAPA 2: Limpar staging table ──────────────────────────────────
    // DELETE com autoCommit garante que a procedure sempre encontre
    // a tabela limpa, independentemente de execuções anteriores
    const deleteResult = await getOracleService().executeCommand(
      `DELETE FROM resumo_programacao_leite_obi`,
      {} as any,
      { autoCommit: true }
    );

    if (!deleteResult.success) {
      return {
        isError: true,
        content: [{ type: "text",
          text: `❌ Erro ao limpar dados do período: ${deleteResult.error}` }],
      };
    }

    // ── ETAPA 3: Executar a stored procedure ───────────────────────────
    // Bind variables em TODOS os parâmetros: zero interpolação de string
    const procResult = await getOracleService().executeCommand(`
      BEGIN
        PK_LAC_OBI.PKB_GERA_PROGLEI(
          ed_dt_inic => :ed_dt_inic,
          ed_dt_fim  => :ed_dt_fim,
          sv_sistema => :sv_sistema,     -- BIND_OUT: Retorno do sistema
          sv_processo => :sv_processo,   -- BIND_OUT: retorno dao nome da procedure
          sv_msg_erro => :sv_msg_erro,   -- BIND_OUT: mensagem de retorno
          sn_cd_erro  => :sn_cd_erro     -- BIND_OUT: código de erro funcional
        );
      END;`,
      {
        ed_dt_inic: period.startDate,
        ed_dt_fim:  period.endDate,
        // Parâmetros de saída da procedure
        sv_sistema: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
        sv_processo: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
        sv_msg_erro: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        sn_cd_erro:  { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      } as any,
      { autoCommit: true }
    );

    // Checar código funcional de retorno da procedure (≠ erro ORA-)
    const outBinds    = procResult.data?.outBinds || {};
    const errorCode   = outBinds.sn_cd_erro;
    const errorMsg    = outBinds.sv_msg_erro;

    if (errorCode && Number(errorCode) !== 0) {
      return {
        isError: true,
        content: [{ type: "text",
          text: `❌ Erro funcional da procedure\nCódigo: ${errorCode}\nMensagem: ${errorMsg}` }],
      };
    }

    // ── ETAPA 4: Construir e executar a query de agregação ─────────────
    const queryBuild = buildLeiteAggregationQuery({
      sumFields:   args.somatorios,
      groupFields: args.agruparPor,
      filters:     args.filtros,
      maxRows:     args.maxRows,
      startDate:   period.startDate,
      endDate:     period.endDate,
    });

    const queryResult = await getOracleService().executeQuery(
      queryBuild.sql,
      queryBuild.binds as any,
      { maxRows: args.maxRows, extendedMetaData: false }
    );

    // ── ETAPA 5: Formatar e retornar ────────────────────────────────────
    const rows = queryResult.data?.rows || [];
    let responseText = `🥛 **Resumo Programação Leite OBI**\n\n`;
    responseText += `**Período:** ${period.startIso} até ${period.endIso}`;
    responseText += period.usedDefaultMonth ? ' (mês atual automático)\n' : '\n';
    responseText += `**Somatórios:** ${queryBuild.selectedSums.join(', ')}\n`;
    responseText += `**Agrupamentos:** ${queryBuild.selectedGroups.join(', ')}\n`;
    responseText += `**Linhas Retornadas:** ${rows.length}\n`;
    responseText += `**Tempo total:** ${formatDuration(
      (procResult.executionTime || 0) + (queryResult.executionTime || 0)
    )}\n\n`;

    if (rows.length === 0) {
      responseText += "Nenhum dado encontrado para os filtros informados.";
    } else if (args.formatAsTable) {
      responseText += "**Resultado**\n\n```\n" +
        formatQueryResultAsTable(rows) + "\n```";
    } else {
      responseText += "```json\n" + JSON.stringify(rows, null, 2) + "\n```";
    }

    return { content: [{ type: "text", text: responseText }] };

  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `❌ Erro: ${error.message}` }],
    };
  }
}
```

---

### 5.4 O SQL dinâmico seguro — `buildLeiteAggregationQuery`

Esta função em `common/leite-aggregation.ts` é o coração da segurança da tool. Ela constrói SQL dinamicamente, mas com **zero interpolação direta de input do usuário**:

```typescript
// common/leite-aggregation.ts

// Allowlists imutáveis: mapeamento semântico → físico
export const ALLOWED_SUM_FIELDS = {
  quantidade_total_entregue: 'TOT_REAL_DEST',
  quantidade_prevista:       'QTDE_PREV_DEST',
  quantidade_programada:     'QTDE_PROG',
} as const;

export const ALLOWED_GROUP_FIELDS = {
  unidade:           'CD_UNID_ORIG',
  fornecedor:        'FORN_ID_ORIG',
  filiada:           'CD_FILI_ORIG',
  posto:             'CD_POSTO_ORIG',
  produto_analisado: 'DESCR_MATERANALI',
} as const;

// Colunas companion: descrições automáticas incluídas com o agrupamento
const GROUP_FIELD_COMPANIONS = {
  unidade:           { column: 'NOME_ORIG',     alias: 'NOME_ORIG' },
  fornecedor:        { column: 'NOME_ORIG',     alias: 'NOME_ORIG' },
  posto:             { column: 'NOME_ORIG',     alias: 'NOME_ORIG' },
  produto_analisado: { column: 'CD_MATERANALI', alias: 'CD_MATERANALI' },
};
```

Cada nome de coluna que entra no SQL é **resolvido a partir da allowlist**, nunca interpolado diretamente. E antes de usar qualquer coluna na string SQL, há uma segunda linha de defesa:

```typescript
// common/utils.ts
export function isValidSqlIdentifier(identifier: string): boolean {
  // Apenas letras, números, _ e $. Deve começar com letra ou _.
  // Máximo 128 caracteres (limite Oracle).
  const regex = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
  return regex.test(identifier) && identifier.length <= 128;
}
```

Mesmo que alguém manipulasse a allowlist (cenário improvável, mas defensivo), a regex barraria qualquer tentativa de injeção via `; DROP TABLE` ou `UNION SELECT`.

O SQL gerado usa **bind variables para todos os valores de filtro e datas**:

```typescript
// Trecho de buildLeiteAggregationQuery
const sql = [
  'SELECT *',
  'FROM (',
  '  SELECT',
  `    ${[...groupExpressions, ...companionExpressions, ...sumExpressions].join(',\n    ')}`,
  '  FROM resumo_programacao_leite_obi',
  `  ${whereSql}`,                              // WHERE DT >= :dt_inic AND ...
  `  GROUP BY ${allGroupByColumns.join(', ')}`,
  `  ORDER BY ${orderByAlias} DESC`,
  ')',
  'WHERE ROWNUM <= :maxRows'                    // Paginação via bind
].join('\n');
```

Resultado típico para `somatorios: ["quantidade_programada"]` e `agruparPor: ["unidade", "fornecedor"]`:

```sql
SELECT *
FROM (
  SELECT
    CD_UNID_ORIG AS UNIDADE,
    FORN_ID_ORIG AS FORNECEDOR,
    NOME_ORIG AS NOME_ORIG,          -- companion automática, deduplificada
    SUM(QTDE_PROG) AS SOMA_QUANTIDADE_PROGRAMADA
  FROM resumo_programacao_leite_obi
  WHERE DT >= :dt_inic AND DT <= :dt_fim
  GROUP BY CD_UNID_ORIG, FORN_ID_ORIG, NOME_ORIG
  ORDER BY SOMA_QUANTIDADE_PROGRAMADA DESC
)
WHERE ROWNUM <= :maxRows
```

---

## 6. Retornos Determinísticos vs. Estocásticos: Por Que Isso Importa

Esta seção responde uma pergunta que todo dev faz na primeira semana com LLMs: *"Por que a LLM às vezes inventa números?"*

### 6.1 O retorno determinístico da tool

Tudo o que acontece dentro do handler TypeScript é **determinístico no sentido computacional clássico**: dado o mesmo input, o mesmo Oracle, o mesmo estado da tabela `resumo_programacao_leite_obi`, você obterá exatamente a mesma tabela de resultado. Não há aleatoriedade, não há probabilidade — é código imperativo.

```
Input: { somatorios: ["quantidade_programada"], agruparPor: ["unidade"], dtInic: "2026-06-01", dtFim: "2026-06-30" }
Output (sempre o mesmo para o mesmo estado do BD):
| UNIDADE | NOME_ORIG      | SOMA_QUANTIDADE_PROGRAMADA |
|---------|----------------|---------------------------|
| U01     | Unidade Norte  | 125.000                   |
| U02     | Unidade Sul    | 98.500                    |
```

### 6.2 O retorno estocástico da LLM

A LLM, por sua natureza, é um modelo probabilístico. Cada token gerado é amostrado de uma distribuição de probabilidade. Isso significa que ao redigir a resposta final para o usuário com base no retorno da tool, a LLM pode:

- Variar o **tom** e a **estrutura** do texto
- Escolher **quais insights destacar** da tabela
- Em casos sem grounding, **alucinar valores** que parecem plausíveis

### 6.3 Como a tool âncora a LLM (Grounding)

O retorno estruturado da tool funciona como uma **âncora factual** — o campo de gravidade que puxa a LLM de volta ao mundo real. Quando a LLM recebe:

```
🥛 Resumo Programação Leite OBI
Período: 2026-06-01 até 2026-06-30
Linhas Retornadas: 2
```
```
| UNIDADE | SOMA_QUANTIDADE_PROGRAMADA |
|---------|---------------------------|
| U01     | 125.000                   |
| U02     | 98.500                    |
```

Ela tem **fatos concretos** para trabalhar. A parte estocástica (como ela redige a resposta ao usuário) permanece, mas a **substância** está ancorada nos dados reais do Oracle. Isso reduz dramaticamente o espaço de alucinação — a LLM pode variar como descreve "125 mil litros programados para a Unidade Norte", mas não vai inventar o número.

**O design da tool amplifica o grounding de três formas:**
1. **Período explícito no retorno** — a LLM sabe exatamente qual intervalo os dados cobrem
2. **Somatórios e agrupamentos no cabeçalho** — a LLM entende o que cada coluna representa
3. **Aviso de mês automático** — quando `usedDefaultMonth: true`, a resposta inclui `(mês atual automático)`, evitando que a LLM assuma um período diferente

---

## 7. Controle de Logs: Depurando o Comportamento da LLM

### 7.1 O logger do projeto

O projeto usa um logger mínimo customizado, sem dependências externas:

```typescript
// common/logger.ts
type LogLevel = 'debug' | 'info' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };

function resolveLevel(): LogLevel {
  const explicit = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (explicit === 'debug' || explicit === 'info' || explicit === 'error') {
    return explicit;
  }
  // Em testes (NODE_ENV=test), suprime info para não poluir o output do Jest
  return process.env.NODE_ENV === 'test' ? 'error' : 'info';
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (activeLevel() <= LEVEL_RANK.debug) {
      console.error('[DEBUG]', ...args); // stderr para não contaminar stdout/MCP
    }
  },
  info: (...args: unknown[]) => {
    if (activeLevel() <= LEVEL_RANK.info) {
      console.error('[INFO]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
```

**Por que `console.error` em vez de `console.log`?** Porque o transporte MCP via stdio usa `stdout` para o protocolo JSON-RPC. Qualquer `console.log` acidental no `stdout` corrompe o stream. Usar `stderr` para todos os logs é uma convenção de segurança para servidores MCP.

### 7.2 O que logar e por quê

O `index.ts` loga o estado completo na inicialização:

```typescript
logger.info("Configuração do Oracle:");
logger.info("- ORACLE_HOST:", process.env.ORACLE_HOST || 'localhost');
logger.info("- ORACLE_PASSWORD:", process.env.ORACLE_PASSWORD ? '***' : 'NÃO DEFINIDA');
// ↑ Senha NUNCA logada — apenas indicador de presença
```

Para depurar **por que a LLM chamou (ou não chamou) a tool**, os logs relevantes são:

| Situação | O que buscar nos logs |
|---|---|
| LLM enviou parâmetros inválidos | Zod lança erro antes do handler — veja o corpo da resposta de erro |
| Procedure retornou erro funcional | `sn_cd_erro ≠ 0` — veja `sv_msg_erro` no log |
| Query retornou 0 linhas | Período sem dados ou filtro muito restritivo |
| Tempo alto de execução | Soma de `procResult.executionTime + queryResult.executionTime` |

Para produção, substitua o logger mínimo por **Pino** ou **Winston** com output JSON estruturado, facilitando a indexação em ferramentas como Grafana Loki ou Elastic:

```typescript
// Exemplo com Pino (não incluído no projeto, mas recomendado para produção)
import pino from 'pino';
const log = pino({ level: process.env.LOG_LEVEL || 'info' });

log.info({ toolName: 'oracle_resumo_programacao_leite', period }, 'Tool invocada');
```

---

## 8. Outras Tools do Projeto: Referência Rápida

O projeto inclui mais 7 tools além da tool de leite. Elas ilustram padrões complementares:

| Tool | Padrão | Destaque |
|---|---|---|
| `oracle_health_check` | Zero parâmetros | Retorna status do pool de conexões |
| `oracle_query` | SQL livre com guardas | `isReadOnlyCommand()` bloqueia DML |
| `oracle_info` | Configuração | Nunca expõe a senha |

A tool `oracle_query` é um bom contra-exemplo: ela aceita SQL livre, mas usa `isReadOnlyCommand()` para garantir que apenas `SELECT` passe. Já `oracle_resumo_programacao_leite` vai na direção oposta — SQL 100% controlado pelo servidor, zero flexibilidade de SQL para o cliente, máximo de previsibilidade.

---

## 9. Resumo: O Fluxo Completo em um Diagrama

```
┌─────────────────────────────────────────────────────────────┐
│  LLM (Claude, GPT-4o, etc.)                                 │
│                                                             │
│  1. Descobre tools via tools/list (MCP)                     │
│  2. Decide chamar oracle_resumo_programacao_leite           │
│  3. Envia tools/call com argumentos JSON                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ JSON-RPC / Streamable HTTP
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  MCP Server (Node.js/TypeScript)                            │
│                                                             │
│  ① Zod valida schema dos argumentos                         │
│  ② resolvePeriod() valida e resolve o intervalo de datas    │
│  ③ executeCommand(DELETE ..., autoCommit: true)             │
│  ④ executeCommand(BEGIN PK_LAC_OBI..., BIND_OUT)            │
│  ⑤ Checa sn_cd_erro da procedure                           │
│  ⑥ buildLeiteAggregationQuery() → SQL seguro + binds        │
│  ⑦ executeQuery() no Oracle                                 │
│  ⑧ Formata resposta em Markdown (tabela ou JSON)            │
└─────────────────────┬───────────────────────────────────────┘
                      │ bind variables
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Oracle Database                                            │
│  · resumo_programacao_leite_obi (staging table)             │
│  · PK_LAC_OBI.PKB_GERA_PROGLEI (stored procedure)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Glossário e Links de Aprofundamento

| Termo | Definição resumida |
|---|---|
| **MCP (Model Context Protocol)** | Protocolo aberto para comunicação padronizada entre LLMs e servidores de ferramentas/contexto |
| **Bearer Token** | Credencial opaca enviada no header `Authorization: Bearer <token>` (RFC 6750) |
| **SHA-256** | Função hash criptográfica de 256 bits; usada para armazenar fingerprints de API keys |
| **Timing Attack** | Ataque que explora variação de tempo de execução para inferir segredos |
| **timingSafeEqual** | Função do `node:crypto` que compara buffers em tempo constante, prevenindo timing attacks |
| **Fail-safe** | Design onde falha de configuração resulta em negação de acesso (oposto de falha aberta) |
| **Rate Limiting** | Controle de frequência de requisições por IP para prevenir força-bruta e DDoS |
| **RFC 6750** | Padrão IETF que define como Bearer Tokens devem ser usados em requisições HTTP |
| **RFC 8414** | Padrão IETF para discovery de Authorization Servers (metadata endpoint) |
| **Tool Grounding** | Técnica de ancorar a LLM a fatos concretos via ferramentas, reduzindo alucinações |
| **Bind Variables** | Parâmetros tipados passados separadamente do SQL, impedindo SQL injection |
| **BIND_OUT** | Direção de bind que recebe valores de saída de stored procedures Oracle |
| **Stateful / Stateless** | Modos de sessão MCP: stateful mantém contexto por UUID; stateless escala horizontalmente |
| **Allowlist** | Lista explícita de valores permitidos — o oposto de blocklist (mais seguro para entradas desconhecidas) |
| **Companion column** | Coluna descritiva incluída automaticamente junto a um campo de agrupamento (ex: `NOME_ORIG` junto a `CD_UNID_ORIG`) |
| **Estocástico** | Processo com componente aleatório; cada execução pode produzir resultado ligeiramente diferente (comportamento de LLMs) |
| **Determinístico** | Processo onde o mesmo input sempre produz o mesmo output (comportamento do código Node.js) |

### Links de aprofundamento

- **Documentação Oficial do MCP:** https://modelcontextprotocol.io/docs
- **Especificação do protocolo MCP:** https://spec.modelcontextprotocol.io
- **MCP Spec 2025-03-26 §Authorization:** https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization/
- **RFC 6750 — Bearer Token Usage:** https://www.rfc-editor.org/rfc/rfc6750
- **RFC 8414 — OAuth 2.0 Authorization Server Metadata:** https://www.rfc-editor.org/rfc/rfc8414
- **TypeScript SDK do MCP:** https://github.com/modelcontextprotocol/typescript-sdk
- **Zod — Validação e inferência de tipos:** https://zod.dev
- **node-oracledb — Driver oficial Oracle:** https://node-oracledb.readthedocs.io
- **Pino — Logger JSON de alta performance:** https://getpino.io
- **MCP Inspector — Ferramenta de debug:** `npx @modelcontextprotocol/inspector`
- **OWASP API Security Top 10:** https://owasp.org/API-Security/

---

*Artigo baseado no código-fonte do projeto `@grec0/mcp-oracle-db` v0.1.4 — inclui autenticação MCP via Bearer Token (RFC 6750) implementada em 2026-06-08.*
