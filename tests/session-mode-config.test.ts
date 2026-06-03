import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';

let indexModule: any;

const originalSessionMode = process.env.MCP_SESSION_MODE;

describe('Session mode config parsing', () => {
  beforeAll(async () => {
    process.env.MCP_AUTO_START = 'false';
    indexModule = await import('../index');
  });

  afterEach(() => {
    if (originalSessionMode === undefined) {
      delete process.env.MCP_SESSION_MODE;
    } else {
      process.env.MCP_SESSION_MODE = originalSessionMode;
    }
  });

  it('deve usar stateful por padrao quando MCP_SESSION_MODE nao for definido', () => {
    delete process.env.MCP_SESSION_MODE;

    const config = indexModule.getHttpConfigFromEnv();
    expect(config.sessionMode).toBe('stateful');
  });

  it('deve aceitar valores validos com variacao de caixa e espacos', () => {
    process.env.MCP_SESSION_MODE = '  STATELESS  ';

    const config = indexModule.getHttpConfigFromEnv();
    expect(config.sessionMode).toBe('stateless');
  });

  it('deve falhar para valor invalido de MCP_SESSION_MODE', () => {
    process.env.MCP_SESSION_MODE = 'statelesss';

    expect(() => indexModule.getHttpConfigFromEnv()).toThrow("Valor inválido para MCP_SESSION_MODE");
  });
});
