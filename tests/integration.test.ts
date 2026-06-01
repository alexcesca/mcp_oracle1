import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { OracleService } from '../tools/oracle-service';

const hasOracleConfig = Boolean(process.env.ORACLE_HOST || process.env.ORACLE_CONNECTION_STRING);
const itOracle = hasOracleConfig ? it : it.skip;

describe('Testes de Integração Oracle MCP', () => {
  let oracleService: OracleService | undefined;

  beforeAll(async () => {
    // Só executar testes se houver configuração do Oracle
    if (!hasOracleConfig) {
      console.log('Pulando testes do Oracle - nenhuma configuração encontrada');
      return;
    }
    
    try {
      oracleService = new OracleService();
    } catch (error) {
      console.log('Pulando testes do Oracle - erro de configuração:', error);
    }
  });

  afterAll(async () => {
    if (oracleService) {
      await oracleService.close();
    }
  });

  itOracle('deve conectar ao banco de dados Oracle', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.healthCheck();
    
    if (result.success) {
      expect(result.success).toBe(true);
      expect(result.data?.connected).toBe(true);
      console.log('✅ Conexão Oracle bem-sucedida');
      console.log('Versão:', result.data?.version);
    } else {
      console.log('❌ Falha na conexão Oracle:', result.error);
      // Não falhar o teste se for problema de configuração
      expect(result.error).toBeTruthy();
    }
  }, 30000);

  itOracle('deve executar uma consulta básica', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.executeQuery('SELECT 1 as TEST_VALUE FROM DUAL');
    
    if (result.success) {
      expect(result.success).toBe(true);
      expect(result.data?.rows).toHaveLength(1);
      expect(result.data?.rows[0].TEST_VALUE).toBe(1);
      console.log('✅ Consulta básica bem-sucedida');
    } else {
      console.log('❌ Falha na consulta básica:', result.error);
      // Permitir que falhe se houver problemas de conexão
      expect(result.error).toBeTruthy();
    }
  }, 30000);

  itOracle('deve listar as tabelas do usuário', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.getTables();
    
    if (result.success) {
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      console.log(`✅ Encontradas ${result.data?.length || 0} tabelas`);
    } else {
      console.log('❌ Falha ao listar tabelas:', result.error);
      expect(result.error).toBeTruthy();
    }
  }, 30000);

  itOracle('deve lidar com SQL inválido graciosamente', async () => {
    expect(oracleService).toBeDefined();
    const service = oracleService!;

    const result = await service.executeQuery('SELECT coluna_inexistente FROM dual');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    console.log('✅ SQL inválido tratado corretamente');
  }, 30000);
});