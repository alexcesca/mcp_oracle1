/**
 * Logger minimo com controle de nivel via variavel de ambiente.
 *
 * Niveis: error | info | debug
 *
 * Padrao por ambiente:
 *   - test  (NODE_ENV=test)  → somente 'error' aparece
 *   - demais                 → 'info' (inclui info + error)
 *
 * Para sobrescrever: defina LOG_LEVEL=debug|info|error
 */

type LogLevel = 'debug' | 'info' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };

function resolveLevel(): LogLevel {
  const explicit = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (explicit === 'debug' || explicit === 'info' || explicit === 'error') {
    return explicit;
  }
  return process.env.NODE_ENV === 'test' ? 'error' : 'info';
}

function activeLevel(): number {
  return LEVEL_RANK[resolveLevel()];
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (activeLevel() <= LEVEL_RANK.debug) {
      console.error('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (activeLevel() <= LEVEL_RANK.info) {
      console.error('[INFO]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
