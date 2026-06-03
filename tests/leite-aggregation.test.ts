import { describe, expect, it } from '@jest/globals';
import {
  buildLeiteAggregationQuery,
  resolvePeriod
} from '../common/leite-aggregation';

describe('Leite aggregation helpers', () => {
  it('deve usar o mês atual quando período não for informado', () => {
    const fixedNow = new Date('2026-05-21T12:00:00.000Z');
    const period = resolvePeriod(undefined, undefined, fixedNow);

    expect(period.startIso).toBe('2026-05-01');
    expect(period.endIso).toBe('2026-05-31');
    expect(period.usedDefaultMonth).toBe(true);
  });

  it('deve falhar quando apenas uma data for informada', () => {
    expect(() => resolvePeriod('2026-05-01', undefined)).toThrow("Informe os dois campos de período");
  });

  it('deve falhar para período invertido', () => {
    expect(() => resolvePeriod('2026-05-31', '2026-05-01')).toThrow("Período inválido");
  });

  it('deve montar SQL com somatórios e agrupamentos permitidos', () => {
    const result = buildLeiteAggregationQuery({
      sumFields: ['quantidade_total_entregue', 'quantidade_programada'],
      groupFields: ['unidade', 'fornecedor'],
      filters: { unidade: 'U01' },
      maxRows: 100
    });

    expect(result.sql).toContain('FROM resumo_programacao_leite_obi');
    expect(result.sql).toContain('CD_UNID_ORIG AS UNIDADE');
    expect(result.sql).toContain('FORN_ID_ORIG AS FORNECEDOR');
    expect(result.sql).toContain('SUM(TOT_REAL_DEST) AS SOMA_QUANTIDADE_TOTAL_ENTREGUE');
    expect(result.sql).toContain('SUM(QTDE_PROG) AS SOMA_QUANTIDADE_PROGRAMADA');
    expect(result.sql).toContain('GROUP BY CD_UNID_ORIG, FORN_ID_ORIG, NOME_ORIG');
    expect(result.sql).toContain('WHERE ROWNUM <= :maxRows');
    expect(result.binds.maxRows).toBe(100);
    expect(result.binds.f_unidade).toBe('U01');
  });

  it('deve bloquear somatório inválido', () => {
    expect(() => buildLeiteAggregationQuery({
      sumFields: ['campo_invalido'],
      groupFields: ['unidade'],
      maxRows: 100
    })).toThrow('somatorio não permitido');
  });

  it('deve bloquear agrupamento inválido', () => {
    expect(() => buildLeiteAggregationQuery({
      sumFields: ['quantidade_prevista'],
      groupFields: ['campo_invalido'],
      maxRows: 100
    })).toThrow('agrupamento não permitido');
  });

  it('deve bloquear filtro não permitido', () => {
    expect(() => buildLeiteAggregationQuery({
      sumFields: ['quantidade_prevista'],
      groupFields: ['unidade'],
      filters: { invalido: 'x' },
      maxRows: 100
    })).toThrow('Filtro não permitido');
  });
});
