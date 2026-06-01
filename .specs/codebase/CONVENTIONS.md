# Convencoes de Codigo

## Convencoes de Nomenclatura

### Arquivos

- Use kebab-case para nomes de arquivos com varias palavras.
- Exemplos:
  - `oracle-service.ts`
  - `register-tools.ts`
  - `leite-aggregation.ts`

### Simbolos

- Classes: PascalCase (`OracleService`).
- Funcoes: camelCase (`resolvePeriod`, `formatQueryResultAsTable`).
- Constantes: UPPER_SNAKE_CASE para constantes globais (`DEFAULT_HTTP_PORT`) e camelCase para valores const locais.
- Interfaces/Tipos: PascalCase (`OracleResult`, `ConnectionStatus`).

## Imports e Modulos

- Estilo de importacao ESM em todo o projeto.
- Imports internos usam extensao `.js` mesmo em codigo TypeScript, para alinhar com a saida NodeNext.
- Exemplos:
  - `import { OracleService } from "./tools/oracle-service.js"`
  - `import { formatDuration } from "../common/utils.js"`

## Padrao de Organizacao de Arquivos

### Arquivos de servico

- Carregamento de configuracao no topo.
- Metodos de inicializacao.
- Metodos da API publica agrupados por capacidade.
- Limpeza e getters no final.

### Arquivo de registro de tools

- As tools sao registradas em ordem logica numerada.
- Cada tool possui:
  - texto de descricao em portugues
  - schema Zod
  - wrapper `try/catch`
  - resposta de erro estruturada com `isError: true`

## Seguranca de Tipos

- Configuracao estrita de TypeScript habilitada (`strict`, `noImplicitAny`, `strictNullChecks`).
- Interfaces compartilhadas centralizadas em `common/types.ts`.
- Lacunas de tipagem do driver sao tratadas com augmentation local em `types/oracledb.d.ts`.

## Convencoes de SQL e Seguranca

- O tipo de comando SQL e inferido por helper (`getSqlCommandType`).
- A checagem somente leitura (`isReadOnlyCommand`) bloqueia comandos que nao sao select em `oracle_query`.
- A query dinamica de agregacao aceita apenas campos de lista permitida:
  - campos de soma (`ALLOWED_SUM_FIELDS`)
  - campos de agrupamento (`ALLOWED_GROUP_FIELDS`)
- Identificadores SQL sao validados com regex (`isValidSqlIdentifier`).

## Estilo de Tratamento de Erros

- Metodos de servico retornam objetos `OracleResult` em vez de lancar erros para quem chama.
- Handlers das tools convertem falhas em respostas de texto MCP.
- Mapeamento amigavel para erros comuns ORA/TNS (`createFriendlyErrorMessage`).

## Logs e Observabilidade

- Logs de runtime usam `console.error` com frequencia nos fluxos de inicializacao e encerramento.
- A saida das tools visa a legibilidade para o usuario final (tabelas, icones e blocos de resumo).

## Documentacao e Comentarios

- Comentarios explicam intencao e comportamento, e nao afirmacoes triviais.
- A maior parte das strings voltadas ao usuario esta em portugues.
