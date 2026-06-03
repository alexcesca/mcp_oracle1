import { describe, expect, it } from '@jest/globals';
import { isReadOnlyCommand } from '../common/utils';

describe('SQL read-only classification', () => {
  it('deve aceitar WITH + SELECT como somente leitura', () => {
    const sql = `
      WITH base AS (
        SELECT 1 AS id FROM dual
      )
      SELECT * FROM base
    `;

    expect(isReadOnlyCommand(sql)).toBe(true);
  });

  it('deve bloquear WITH + INSERT como nao somente leitura', () => {
    const sql = `
      WITH base AS (
        SELECT 1 AS id FROM dual
      )
      INSERT INTO tabela_destino (id)
      SELECT id FROM base
    `;

    expect(isReadOnlyCommand(sql)).toBe(false);
  });

  it('deve bloquear WITH + DELETE como nao somente leitura', () => {
    const sql = `
      WITH ids AS (
        SELECT 1 AS id FROM dual
      )
      DELETE FROM tabela_destino
      WHERE id IN (SELECT id FROM ids)
    `;

    expect(isReadOnlyCommand(sql)).toBe(false);
  });

  it('deve bloquear UPDATE direto como nao somente leitura', () => {
    const sql = 'UPDATE tabela_destino SET ativo = 0 WHERE id = 1';
    expect(isReadOnlyCommand(sql)).toBe(false);
  });
});
