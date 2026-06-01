# Architecture

Pattern: Modular monolith (single process MCP server with layered modules)

## High-Level Structure

- Entry point (`index.ts`): bootstraps MCP server, chooses transport (stdio/http/https), handles lifecycle and shutdown.
- Tool registration (`tools/register-tools.ts`): declares MCP tools, input schemas, and response formatting.
- Service layer (`tools/oracle-service.ts`): encapsulates Oracle client init, pooling, query/command execution, and metadata queries.
- Domain/helper layer (`common/*.ts`): SQL-safe helper logic, period resolution, allowlisted aggregation query builder, and shared types.

## Main Runtime Flow

1. Process starts in `index.ts`.
2. `McpServer` is created with name and version.
3. `registerAllTools` registers each tool with Zod input schema.
4. First tool call lazily initializes `OracleService`.
5. `OracleService` loads env config and initializes node-oracledb.
6. Tool handler calls a service method (`executeQuery`, `executeCommand`, `getTables`, etc.).
7. Service gets a pooled connection, runs SQL, maps result, closes connection.
8. Tool handler formats response text for MCP client.

## Transport Architecture

### STDIO Mode

- Uses `StdioServerTransport`.
- Best for local MCP clients that spawn process directly.

### HTTP/HTTPS + SSE Mode

- Uses `StreamableHTTPServerTransport`.
- Server validates path, method, and `Origin` header.
- Supported methods on MCP path:
  - `POST`: JSON-RPC payload
  - `GET` and `DELETE`: delegated to MCP transport handler
- HTTPS mode reads key/cert from env paths.

## Tooling Pattern

Each tool in `register-tools.ts` follows the same structure:

1. Validate input schema with Zod.
2. Optional guardrails (example: `oracle_query` only allows read-only SQL).
3. Call service method.
4. Format domain-specific output text.
5. Return MCP `content` or `isError` response.

Current tool set:

- `oracle_health_check`
- `oracle_query`
- `oracle_execute`
- `oracle_list_tables`
- `oracle_describe_table`
- `oracle_transaction`
- `oracle_info`
- `oracle_resumo_programacao_leite`

## Domain-Specific Flow: Resumo Programacao Leite

1. Resolve period (`resolvePeriod`): explicit dates or current month default.
2. Cleanup target table (`DELETE FROM resumo_programacao_leite_obi`).
3. Execute PL/SQL package (`PK_LAC_OBI.PKB_GERA_PROGLEI`).
4. Validate out bind error code/message.
5. Build aggregation SQL from allowlisted fields only.
6. Query aggregated data and format as table/JSON output.

This path is protected by allowlists in `common/leite-aggregation.ts` to avoid arbitrary SQL column injection.

## Data and Error Handling

- SQL execution returns normalized `OracleResult<T>` wrappers.
- Service maps low-level Oracle errors into user-friendly messages via `createFriendlyErrorMessage`.
- Connections are always closed in `finally` blocks.
- Pool is singleton per process instance and closed on shutdown.

## Code Organization

Approach: Layered by responsibility

- Transport/boot: `index.ts`
- MCP tool interface layer: `tools/register-tools.ts`
- DB integration layer: `tools/oracle-service.ts`
- Shared domain/util layer: `common/*`
- Tests: `tests/*`
