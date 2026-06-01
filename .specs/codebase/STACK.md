# Pilha Tecnologica

Analisado em: 2026-06-01

## Nucleo

- Tipo de projeto: servidor MCP para Oracle Database
- Linguagem: TypeScript 5.6.x
- Runtime: Node.js >= 18 (a imagem Docker usa Node 20)
- Sistema de modulos: ESM (`type: module`, `module: NodeNext`)
- Gerenciador de pacotes: npm (`package-lock.json` presente)

## Backend

- Camada de protocolo: Model Context Protocol (MCP)
- SDK MCP: `@modelcontextprotocol/sdk` ^1.29.0
- Modos de transporte:
  - `stdio` (modo de execucao padrao)
  - `http` com SSE (Streamable HTTP)
  - `https` com SSE
- Validacao: `zod` ^3.22.4
- Conversao de schema: `zod-to-json-schema` ^3.23.5

## Banco de Dados

- Driver: `oracledb` ^6.10.0
- Alvo de banco: Oracle Database (incluindo caminho de compatibilidade para versoes antigas)
- Modelo de conexao: conexoes baseadas em pool (`oracledb.createPool`)

## Testes

- Framework de testes: Jest 29 + ts-jest
- Testes unitarios: modulos helper (`common/leite-aggregation.ts`)
- Testes de integracao:
  - transporte HTTP/SSE e HTTPS/SSE
  - testes de integracao Oracle (dependentes de ambiente)

## Ferramentas de Build e Desenvolvimento

- Compilador TypeScript: `tsc`
- Runtime de desenvolvimento para TS: `tsx`
- Utilitario de shell: `shx`
- Definicoes de tipos: `@types/node`, `@types/jest`

## Containerizacao e Operacao de Runtime

- Containerizacao: Docker + docker-compose
- Imagem base: `node:20-bullseye-slim`
- Oracle Instant Client no container: 19.19 (suporte a modo thick)

## CLI e Scripts

- Build: `npm run build`
- Dev: `npm run dev`
- Start (stdio): `npm run start`
- Start HTTP: `npm run start:http`
- Start HTTPS: `npm run start:https`
- Testes: `npm test`
- Inspector: `npm run inspector`
