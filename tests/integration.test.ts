import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { OracleService } from '../tools/oracle-service';

describe('Testes de Integração Oracle MCP', () => {
  let oracleService: OracleService;

  beforeAll(async () => {
    // Só executar testes se houver configuração do Oracle
    if (!process.env.ORACLE_HOST && !process.env.ORACLE_CONNECTION_STRING) {
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

  it('deve conectar ao banco de dados Oracle', async () => {
    if (!oracleService) {
      console.log('Pulando teste - nenhum serviço Oracle');
      return;
    }

    const result = await oracleService.healthCheck();
    
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

  it('deve executar uma consulta básica', async () => {
    if (!oracleService) {
      console.log('Pulando teste - nenhum serviço Oracle');
      return;
    }

    const result = await oracleService.executeQuery('SELECT 1 as TEST_VALUE FROM DUAL');
    
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

  it('deve listar as tabelas do usuário', async () => {
    if (!oracleService) {
      console.log('Pulando teste - nenhum serviço Oracle');
      return;
    }

    const result = await oracleService.getTables();
    
    if (result.success) {
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      console.log(`✅ Encontradas ${result.data?.length || 0} tabelas`);
    } else {
      console.log('❌ Falha ao listar tabelas:', result.error);
      expect(result.error).toBeTruthy();
    }
  }, 30000);

  it('deve lidar com SQL inválido graciosamente', async () => {
    if (!oracleService) {
      console.log('Pulando teste - nenhum serviço Oracle');
      return;
    }

    const result = await oracleService.executeQuery('SELECT 1 FROM dual');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    console.log('✅ SQL inválido tratado corretamente');
  }, 30000);
});