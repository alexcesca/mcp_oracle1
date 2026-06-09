#!/usr/bin/env node
/**
 * Gerador de chaves de API para o MCP Oracle DB Server.
 *
 * Uso:
 *   npm run generate-key
 *   node scripts/generate-key.mjs
 *
 * Saída:
 *   API Key  → copie para o cliente / arquivo de segredos
 *   SHA-256  → adicione ao MCP_API_KEYS no .env do servidor
 */

import { randomBytes, createHash } from 'node:crypto';

const key  = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(key, 'utf8').digest('hex');

console.log('');
console.log('========================================');
console.log('  MCP Oracle DB – Nova Chave de API');
console.log('========================================');
console.log('');
console.log(`API Key   : ${key}`);
console.log(`SHA-256   : ${hash}`);
console.log('');
console.log('Instruções:');
console.log('  1. Guarde a "API Key" em um gerenciador de segredos ou variável de ambiente do cliente.');
console.log('  2. Adicione o "SHA-256" ao MCP_API_KEYS no arquivo .env do servidor:');
console.log(`       MCP_API_KEYS=${hash}`);
console.log('  3. Para múltiplas chaves, separe os hashes com vírgula:');
console.log('       MCP_API_KEYS=hash1,hash2,hash3');
console.log('');
console.log('  O cliente deve enviar a API Key no header:');
console.log(`    Authorization: Bearer ${key}`);
console.log('========================================');
console.log('');
