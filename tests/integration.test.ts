import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { OracleService } from '../tools/oracle-service';

const hasOracleConfig = Boolean(process.env.ORACLE_HOST || process.env.ORACLE_CONNECTION_STRING);
const describeOracle = hasOracleConfig ? describe : describe.skip;

describeOracle('Testes de Integração Oracle MCP', () => {
  let oracleService: OracleService | undefined;

  beforeAll(async () => {
    try {
      oracleService = new OracleService();
    } catch (error) {
      throw new Error(`Falha ao inicializar OracleService para testes de integração: ${String(error)}`);
    }
  });

  afterAll(async () => {
    if (oracleService) {
      await oracleService.close();
    }
  });

  it('deve conectar ao banco de dados Oracle', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.healthCheck();

    expect(result.success).toBe(true);
    expect(result.data?.connected).toBe(true);
    expect(result.data?.version).toBeTruthy();
  }, 30000);

  it('deve executar uma consulta básica', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.executeQuery('SELECT 1 as TEST_VALUE FROM DUAL');

    expect(result.success).toBe(true);
    expect(result.data?.rows).toHaveLength(1);
    expect(result.data?.rows[0].TEST_VALUE).toBe(1);
  }, 30000);

  it('deve listar as tabelas do usuário', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.getTables();

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  }, 30000);

  it('deve lidar com SQL inválido graciosamente', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.executeQuery('SELECT coluna_inexistente FROM dual');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  }, 30000);
});

if (!hasOracleConfig) {
  // Mantem diagnostico explicito no output quando a suite e ignorada por falta de configuracao.
  console.log('Testes de integracao Oracle ignorados: defina ORACLE_HOST ou ORACLE_CONNECTION_STRING para executa-los.');
}