import { isValidSqlIdentifier } from './utils.js';

export const ALLOWED_SUM_FIELDS = {
  quantidade_total_entregue: 'TOT_REAL_DEST',
  quantidade_prevista: 'QTDE_PREV_DEST',
  quantidade_programada: 'QTDE_PROG'
} as const;

export const ALLOWED_GROUP_FIELDS = {
  unidade: 'CD_UNID_ORIG',
  fornecedor: 'FORN_ID_ORIG',
  filiada: 'CD_FILI_ORIG',
  posto: 'CD_POSTO_ORIG',
  produto_analisado: 'DESCR_MATERANALI'
} as const;

// Colunas companheiras (nome/descrição) incluídas automaticamente junto ao agrupamento.
// Quando múltiplos campos compartilham a mesma coluna (ex: NOME_ORIG), ela é deduplificada.
export const GROUP_FIELD_COMPANIONS: Partial<Record<keyof typeof ALLOWED_GROUP_FIELDS, { column: string; alias: string }>> = {
  unidade:           { column: 'NOME_ORIG',      alias: 'NOME_ORIG' },
  fornecedor:        { column: 'NOME_ORIG',      alias: 'NOME_ORIG' },
  posto:             { column: 'NOME_ORIG',      alias: 'NOME_ORIG' },
  produto_analisado: { column: 'CD_MATERANALI',  alias: 'CD_MATERANALI' }
};

export type AllowedSumField = keyof typeof ALLOWED_SUM_FIELDS;
export type AllowedGroupField = keyof typeof ALLOWED_GROUP_FIELDS;

export interface ResolvedPeriod {
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  usedDefaultMonth: boolean;
}

export interface AggregationQueryBuildResult {
  sql: string;
  binds: Record<string, any>;
  selectedGroups: AllowedGroupField[];
  selectedSums: AllowedSumField[];
}

function formatDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(dateValue: string, fieldName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error(`Campo '${fieldName}' deve estar no formato YYYY-MM-DD.`);
  }

  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Campo '${fieldName}' possui uma data inválida.`);
  }

  const reparsed = formatDateIso(parsed);
  if (reparsed !== dateValue) {
    throw new Error(`Campo '${fieldName}' possui uma data inválida.`);
  }

  return parsed;
}

export function resolvePeriod(dtInic?: string, dtFim?: string, referenceDate: Date = new Date()): ResolvedPeriod {
  if (!dtInic && !dtFim) {
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();

    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0));

    return {
      startDate,
      endDate,
      startIso: formatDateIso(startDate),
      endIso: formatDateIso(endDate),
      usedDefaultMonth: true
    };
  }

  if (!dtInic || !dtFim) {
    throw new Error("Informe os dois campos de período: 'dtInic' e 'dtFim'.");
  }

  const startDate = parseIsoDate(dtInic, 'dtInic');
  const endDate = parseIsoDate(dtFim, 'dtFim');

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error("Período inválido: 'dtInic' deve ser menor ou igual a 'dtFim'.");
  }

  return {
    startDate,
    endDate,
    startIso: formatDateIso(startDate),
    endIso: formatDateIso(endDate),
    usedDefaultMonth: false
  };
}

function assertAllowedFields<T extends string>(
  fields: string[],
  allowedMap: Record<string, string>,
  kind: 'somatorio' | 'agrupamento'
): T[] {
  if (!fields || fields.length === 0) {
    throw new Error(`Informe ao menos um campo de ${kind}.`);
  }

  const unique = Array.from(new Set(fields));
  const invalid = unique.filter((field) => !(field in allowedMap));

  if (invalid.length > 0) {
    throw new Error(`Campo(s) de ${kind} não permitido(s): ${invalid.join(', ')}.`);
  }

  return unique as T[];
}

export function buildLeiteAggregationQuery(params: {
  sumFields: string[];
  groupFields: string[];
  filters?: Partial<Record<string, string>>;
  maxRows: number;
  startDate?: Date;
  endDate?: Date;
}): AggregationQueryBuildResult {
  const selectedSums = assertAllowedFields<AllowedSumField>(
    params.sumFields,
    ALLOWED_SUM_FIELDS,
    'somatorio'
  );

  const selectedGroups = assertAllowedFields<AllowedGroupField>(
    params.groupFields,
    ALLOWED_GROUP_FIELDS,
    'agrupamento'
  );

  if (!Number.isInteger(params.maxRows) || params.maxRows < 1) {
    throw new Error("Campo 'maxRows' deve ser um inteiro positivo.");
  }

  const groupExpressions = selectedGroups.map((field) => {
    const columnName = ALLOWED_GROUP_FIELDS[field];
    if (!isValidSqlIdentifier(columnName)) {
      throw new Error(`Coluna inválida para agrupamento: ${columnName}.`);
    }
    return `${columnName} AS ${field.toUpperCase()}`;
  });

  // Colunas companheiras deduplificadas (nome/descrição associadas ao agrupamento)
  const seenCompanionColumns = new Set<string>();
  const companionSelectExpressions: string[] = [];
  const companionGroupByColumns: string[] = [];

  for (const field of selectedGroups) {
    const companion = GROUP_FIELD_COMPANIONS[field];
    if (companion && !seenCompanionColumns.has(companion.column)) {
      if (!isValidSqlIdentifier(companion.column) || !isValidSqlIdentifier(companion.alias)) {
        throw new Error(`Coluna companion inválida: ${companion.column}.`);
      }
      seenCompanionColumns.add(companion.column);
      companionSelectExpressions.push(`${companion.column} AS ${companion.alias}`);
      companionGroupByColumns.push(companion.column);
    }
  }

  const sumExpressions = selectedSums.map((field) => {
    const columnName = ALLOWED_SUM_FIELDS[field];
    if (!isValidSqlIdentifier(columnName)) {
      throw new Error(`Coluna inválida para somatório: ${columnName}.`);
    }
    return `SUM(${columnName}) AS SOMA_${field.toUpperCase()}`;
  });

  const binds: Record<string, any> = {
    maxRows: params.maxRows
  };

  const whereClauses: string[] = [];

  if (params.startDate) {
    whereClauses.push('DT >= :dt_inic');
    binds['dt_inic'] = params.startDate;
  }

  if (params.endDate) {
    whereClauses.push('DT <= :dt_fim');
    binds['dt_fim'] = params.endDate;
  }

  if (params.filters) {
    for (const [field, value] of Object.entries(params.filters)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (!(field in ALLOWED_GROUP_FIELDS)) {
        throw new Error(`Filtro não permitido: ${field}.`);
      }

      const bindName = `f_${field}`;
      const col = ALLOWED_GROUP_FIELDS[field as AllowedGroupField];
      whereClauses.push(`${col} = :${bindName}`);
      binds[bindName] = value;
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const groupByColumns = selectedGroups.map((field) => ALLOWED_GROUP_FIELDS[field]);
  const allGroupByColumns = [...groupByColumns, ...companionGroupByColumns];
  const orderByAlias = `SOMA_${selectedSums[0].toUpperCase()}`;

  const sql = [
    'SELECT *',
    'FROM (',
    '  SELECT',
    `    ${[...groupExpressions, ...companionSelectExpressions, ...sumExpressions].join(',\n    ')}`,
    '  FROM resumo_programacao_leite_obi',
    `  ${whereSql}`,
    `  GROUP BY ${allGroupByColumns.join(', ')}`,
    `  ORDER BY ${orderByAlias} DESC`,
    ')',
    'WHERE ROWNUM <= :maxRows'
  ].join('\n');

  return {
    sql,
    binds,
    selectedGroups,
    selectedSums
  };
}
