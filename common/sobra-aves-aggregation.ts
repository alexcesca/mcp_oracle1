export { resolvePeriod } from './leite-aggregation.js';

// ─────────────────────────────────────────────
//  Campos permitidos – somatórios
// ─────────────────────────────────────────────
export const ALLOWED_SUM_FIELDS_SOBRA = {
  qtde_entregue:    'QTDE_ENTREGUE',
  qtde_sobra:       'QTDE_SOBRA',
  qtde_sobra_p_ave: 'QTDE_SOBRA_P_AVE'
} as const;

export type AllowedSumFieldSobra = keyof typeof ALLOWED_SUM_FIELDS_SOBRA;

// ─────────────────────────────────────────────
//  Campos permitidos – agrupamentos
// ─────────────────────────────────────────────
// isConcat=true → as colunas são concatenadas com '-' em uma única coluna de saída
export const ALLOWED_GROUP_FIELDS_SOBRA = {
  associado: {
    columns: ['CD_FILI', 'CD_ASSO', 'CD_PROP', 'CD_AVIARIO', 'CD_LOTCAMAVES', 'NOME_ASSO'] as const,
    description: 'Concatena cd_fili-cd_asso-cd_prop-cd_aviario-cd_lotcamaves-nome_asso',
    isConcat: true,
    outputAlias: 'ASSOCIADO'
  },
  filiada: {
    columns: ['CD_FILI', 'NOME_FILI'] as const,
    description: 'cd_fili, nome_fili',
    isConcat: false,
    outputAlias: null
  },
  item: {
    columns: ['CD_ITEM', 'DESCR_ITEM'] as const,
    description: 'cd_item, descr_item',
    isConcat: false,
    outputAlias: null
  },
  assistente_tecnico: {
    columns: ['CD_ASSIS', 'NOME_ASSIS'] as const,
    description: 'cd_assis, nome_assis',
    isConcat: false,
    outputAlias: null
  },
  unidade_abate: {
    columns: ['CD_UNID_ABATE', 'ABREV_UNID_ABATE'] as const,
    description: 'cd_unid_abate, abrev_unid_abate (nome completo em nome_unid_abate)',
    isConcat: false,
    outputAlias: null
  },
  sexo_aves: {
    columns: ['CD_AVESSEXOTV', 'DESCR_AVESSEXOTV'] as const,
    description: 'cd_avessexotv, descr_avessexotv',
    isConcat: false,
    outputAlias: null
  },
  tipo_nao_conformidade: {
    columns: ['CD_TPNCONFAGR', 'DESCR_TPNCONFAGR'] as const,
    description: 'cd_tpnconfagr, descr_tpnconfagr',
    isConcat: false,
    outputAlias: null
  },
  tipo_sobra: {
    columns: ['TIPO_SOBRA'] as const,
    description: '0 = SOBROU no lote, 1 = TRANSFERENCIA',
    isConcat: false,
    outputAlias: 'TIPO_SOBRA'
  },
  data_fechamento: {
    columns: ['DT_FECH'] as const,
    description: 'Data de fechamento do lote',
    isConcat: false,
    outputAlias: 'DT_FECH'
  }
} as const;

export type AllowedGroupFieldSobra = keyof typeof ALLOWED_GROUP_FIELDS_SOBRA;

export interface SobraAvesAggregationResult {
  rows: Record<string, any>[];
  selectedGroups: AllowedGroupFieldSobra[];
  selectedSums: AllowedSumFieldSobra[];
  totalRawRows: number;
}

// ─────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────

/** Acessa coluna em maiúsculo ou minúsculo (oracledb retorna uppercase por padrão). */
function getCol(row: Record<string, any>, col: string): any {
  return row[col] ?? row[col.toLowerCase()] ?? null;
}

function formatTipoSobra(val: any): string {
  const n = Number(val);
  if (n === 0) return '0 - SOBROU no lote';
  if (n === 1) return '1 - TRANSFERENCIA';
  return String(val ?? '');
}

function formatDate(val: any): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val);
}

function assertAllowedFields<T extends string>(
  fields: string[],
  allowedMap: Record<string, any>,
  kind: 'somatório' | 'agrupamento'
): T[] {
  if (!fields || fields.length === 0) {
    throw new Error(`Informe ao menos um campo de ${kind}.`);
  }
  const unique = Array.from(new Set(fields));
  const invalid = unique.filter((f) => !(f in allowedMap));
  if (invalid.length > 0) {
    throw new Error(`Campo(s) de ${kind} não permitido(s): ${invalid.join(', ')}.`);
  }
  return unique as T[];
}

/** Constrói a chave de agrupamento e o objeto de saída para uma linha bruta. */
function buildGroupEntry(
  row: Record<string, any>,
  groupFields: AllowedGroupFieldSobra[]
): { key: string; groupData: Record<string, any> } {
  const keyParts: string[] = [];
  const groupData: Record<string, any> = {};

  for (const field of groupFields) {
    const def = ALLOWED_GROUP_FIELDS_SOBRA[field];

    if (field === 'associado') {
      const parts = def.columns.map((col) => String(getCol(row, col) ?? ''));
      const concat = parts.join('-');
      keyParts.push(concat);
      groupData['ASSOCIADO'] = concat;

    } else if (field === 'tipo_sobra') {
      const raw = getCol(row, 'TIPO_SOBRA');
      const formatted = formatTipoSobra(raw);
      keyParts.push(formatted);
      groupData['TIPO_SOBRA'] = formatted;

    } else if (field === 'data_fechamento') {
      const raw = getCol(row, 'DT_FECH');
      const formatted = formatDate(raw);
      keyParts.push(formatted);
      groupData['DT_FECH'] = formatted;

    } else {
      for (const col of def.columns) {
        const val = getCol(row, col);
        keyParts.push(String(val ?? ''));
        groupData[col] = val;
      }
    }
  }

  return { key: keyParts.join('||'), groupData };
}

// ─────────────────────────────────────────────
//  Função principal de agregação (lado TypeScript)
// ─────────────────────────────────────────────

/**
 * Recebe as linhas brutas retornadas do cursor Oracle
 * (SELECT * FROM TABLE(est_dadoslote)) e agrupa + soma
 * conforme os campos solicitados.
 */
export function aggregateSobraAvesRows(params: {
  rawRows: Record<string, any>[];
  sumFields: string[];
  groupFields: string[];
  maxRows: number;
}): SobraAvesAggregationResult {
  const selectedSums = assertAllowedFields<AllowedSumFieldSobra>(
    params.sumFields,
    ALLOWED_SUM_FIELDS_SOBRA,
    'somatório'
  );

  const selectedGroups = assertAllowedFields<AllowedGroupFieldSobra>(
    params.groupFields,
    ALLOWED_GROUP_FIELDS_SOBRA,
    'agrupamento'
  );

  if (!Number.isInteger(params.maxRows) || params.maxRows < 1) {
    throw new Error("Campo 'maxRows' deve ser um inteiro positivo.");
  }

  // Quando qtde_sobra_p_ave é solicitado, precisamos acumular
  // qtde_sobra e qtde_entregue internamente para recalculá-lo corretamente.
  const needsSobraPAve = selectedSums.includes('qtde_sobra_p_ave');
  const extraInternalFields: AllowedSumFieldSobra[] = [];
  if (needsSobraPAve) {
    if (!selectedSums.includes('qtde_sobra'))    extraInternalFields.push('qtde_sobra');
    if (!selectedSums.includes('qtde_entregue')) extraInternalFields.push('qtde_entregue');
  }
  const allSumFields = [...selectedSums, ...extraInternalFields];

  const groups = new Map<string, Record<string, any>>();

  for (const row of params.rawRows) {
    const { key, groupData } = buildGroupEntry(row, selectedGroups);

    if (!groups.has(key)) {
      const entry: Record<string, any> = { ...groupData };
      for (const sumField of allSumFields) {
        entry[`SOMA_${sumField.toUpperCase()}`] = 0;
      }
      groups.set(key, entry);
    }

    const entry = groups.get(key)!;
    for (const sumField of allSumFields) {
      const col = ALLOWED_SUM_FIELDS_SOBRA[sumField];
      entry[`SOMA_${sumField.toUpperCase()}`] += Number(getCol(row, col)) || 0;
    }
  }

  // Recalcula SOMA_QTDE_SOBRA_P_AVE como soma_sobra / soma_entregue
  if (needsSobraPAve) {
    for (const entry of groups.values()) {
      const totalSobra    = entry['SOMA_QTDE_SOBRA']    || 0;
      const totalEntregue = entry['SOMA_QTDE_ENTREGUE'] || 0;
      entry['SOMA_QTDE_SOBRA_P_AVE'] =
        totalEntregue > 0 ? totalSobra / totalEntregue : 0;
    }
    // Remove acumuladores internos que não foram pedidos originalmente
    for (const field of extraInternalFields) {
      for (const entry of groups.values()) {
        delete entry[`SOMA_${field.toUpperCase()}`];
      }
    }
  }

  const firstSumAlias = `SOMA_${selectedSums[0].toUpperCase()}`;
  const sorted = Array.from(groups.values()).sort(
    (a, b) => (b[firstSumAlias] || 0) - (a[firstSumAlias] || 0)
  );

  return {
    rows: sorted.slice(0, params.maxRows),
    selectedGroups,
    selectedSums,
    totalRawRows: params.rawRows.length
  };
}
