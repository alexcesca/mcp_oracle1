# MCP Oracle Database Server

Servidor MCP (Model Context Protocol) para integração completa com Oracle Database. Permite executar consultas SQL, comandos DDL/DML, gerenciar transações e explorar a estrutura do banco de dados diretamente de aplicações MCP.

## 🚀 Características

- **Consultas SQL**: Executa SELECT com formatação inteligente de resultados
- **Comandos DML/DDL**: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.
- **Gestão de Transações**: Suporte para transações manuais e automáticas
- **Exploração de BD**: Lista tabelas, descreve estruturas, explora esquemas
- **Pool de Conexões**: Gestão eficiente de conexões com Oracle
- **Compatibilidade**: Suporte para versões antigas do Oracle (pré-12c)
- **Monitoramento**: Health checks e estatísticas de conexão

## 📋 Ferramentas Disponíveis

### `oracle_health_check`
Verifica o estado de saúde da conexão Oracle DB.

### `oracle_query`
Executa consultas SQL SELECT com formato de tabela ou JSON.
- **Parâmetros**: `sql`, `maxRows`, `formatAsTable`, `showMetadata`

### `oracle_execute` 
Executa comandos SQL (INSERT, UPDATE, DELETE, CREATE, etc.).
- **Parâmetros**: `sql`, `autoCommit`, `showDetails`

### `oracle_list_tables`
Lista todas as tabelas do esquema especificado.
- **Parâmetros**: `owner`, `showDetails`

### `oracle_describe_table`
Mostra a estrutura completa de uma tabela.
- **Parâmetros**: `tableName`, `owner`, `showDetails`

### `oracle_transaction`
Executa múltiplos comandos SQL em uma transação.
- **Parâmetros**: `commands`, `rollbackOnError`

### `oracle_info`
Mostra informações de configuração da conexão.

### `oracle_resumo_programacao_leite`
Executa `PK_LAC_OBI.PKB_GERA_PROGLEI` para o período solicitado e, em seguida, consulta a tabela `resumo_programacao_leite_obi` com somatórios e agrupamentos controlados por allowlist.
- **Parâmetros**: `dtInic`, `dtFim`, `sistema`, `processo`, `somatorios`, `agruparPor`, `filtros`, `maxRows`, `formatAsTable`
- **Comportamento de período**: quando `dtInic` e `dtFim` não são informadas, usa automaticamente o mês atual; se apenas uma data for informada, retorna erro de validação.
- **Campos permitidos (somatórios)**: `quantidade_total_entregue`, `quantidade_prevista`, `quantidade_programada`
- **Campos permitidos (agrupamentos/filtros)**: `unidade`, `fornecedor`, `filiada`, `posto`, `produto_analisado`

## 🛠️ Instalação

### ⚠️ **IMPORTANTE: Para Oracle 9g e versões antigas**

Se você estiver usando Oracle 9g ou versões anteriores, deve seguir estes passos adicionais:

1. **Configurar modo de compatibilidade**:
```bash
ORACLE_OLD_CRYPTO=true
```

2. **Baixar o Oracle Instant Client 19.26** (obrigatório para Oracle 9g):
   - **Windows**: [instantclient-basic-windows.x64-19.26.0.0.0dbru.zip](https://download.oracle.com/otn_software/nt/instantclient/1926000/instantclient-basic-windows.x64-19.26.0.0.0dbru.zip)
   - Extrair em uma pasta (ex: `C:\oracle\instantclient_19_26`)
   - Configurar o caminho:
```bash
ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_19_26
```

3. **Configuração MCP para Oracle 9g**:
```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "npx",
      "args": ["@grec0/mcp-oracle-db"],
      "env": {
        "ORACLE_HOST": "seu-host-oracle",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE_NAME": "seu-servico",
        "ORACLE_USERNAME": "usuario",
        "ORACLE_PASSWORD": "senha",
        "ORACLE_OLD_CRYPTO": "true",
        "ORACLE_CLIENT_LIB_DIR": "C:\\oracle\\instantclient_19_26"
      }
    }
  }
}
```

### Instalação Geral MCP LOCAL (NÃO RECOMENDADO)

1. **Instalar dependências**:
```bash
npm install
```

2. **Configurar variáveis de ambiente**:
```bash
cp config.example.env .env
# Editar .env com a configuração do seu banco de dados
```

3. **Compilar**:
```bash
npm run build
```

## ⚙️ Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-------------|-------------|
| `ORACLE_HOST` | Host do servidor Oracle | `localhost` |
| `ORACLE_PORT` | Porta do Oracle | `1521` |
| `ORACLE_SERVICE_NAME` | Nome do serviço Oracle | `XE` |
| `ORACLE_USERNAME` | Usuário do banco de dados | `hr` |
| `ORACLE_PASSWORD` | Senha do banco de dados | `hr` |
| `ORACLE_CONNECTION_STRING` | Connection string completa (alternativo) | - |
| `ORACLE_OLD_CRYPTO` | **OBRIGATÓRIO para Oracle 9g** - Usar modo Thick | `false` |
| `ORACLE_CLIENT_LIB_DIR` | **OBRIGATÓRIO para Oracle 9g** - Caminho para o Instant Client 19.26 | - |
| `ORACLE_POOL_MIN` | Conexões mínimas do pool | `1` |
| `ORACLE_POOL_MAX` | Conexões máximas do pool | `10` |
| `ORACLE_POOL_TIMEOUT` | Timeout do pool em segundos | `60` |
| `ORACLE_FETCH_SIZE` | Linhas a buscar por lote | `100` |
| `ORACLE_STMT_CACHE_SIZE` | Tamanho do cache de statements | `30` |

### Configuração MCP em Aplicações USANDO NPX (RECOMENDADO)

#### Localização do arquivo de configuração

**Claude Desktop:**
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

#### Para Claude Desktop (config.json)

**Configuração para Oracle 9g (com Instant Client 19.26):**
```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "npx",
      "args": ["@grec0/mcp-oracle-db"],
      "env": {
        "ORACLE_HOST": "seu-host-oracle",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE_NAME": "seu-servico",
        "ORACLE_USERNAME": "usuario",
        "ORACLE_PASSWORD": "senha",
        "ORACLE_OLD_CRYPTO": "true",
        "ORACLE_CLIENT_LIB_DIR": "C:\\oracle\\instantclient_19_26"
      }
    }
  }
}
```

**Configuração para Oracle 12c ou superior:**
```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "npx",
      "args": ["@grec0/mcp-oracle-db"],
      "env": {
        "ORACLE_HOST": "host",
        "ORACLE_PORT": "port",
        "ORACLE_SERVICE_NAME": "service",
        "ORACLE_USERNAME": "user",
        "ORACLE_PASSWORD": "password"
      }
    }
  }
}
```

#### Para instalação local

```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "node",
      "args": ["C:/workspaces/mcps/mcp-oracle-db/dist/index.js"],
      "env": {
        "ORACLE_HOST": "host",
        "ORACLE_PORT": "post",
        "ORACLE_SERVICE_NAME": "service",
        "ORACLE_USERNAME": "user",
        "ORACLE_PASSWORD": "pass",
        "ORACLE_OLD_CRYPTO": "true"
      }
    }
  }
}
```

#### Para ambiente de desenvolvimento

```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "C:/workspaces/mcps/mcp-oracle-db",
      "env": {
        "ORACLE_HOST": "localhost",
        "ORACLE_PORT": "1521", 
        "ORACLE_SERVICE_NAME": "XE",
        "ORACLE_USERNAME": "hr",
        "ORACLE_PASSWORD": "hr"
      }
    }
  }
}
```

## **HTTP/SSE Transport**

- **Resumo:** O servidor suporta o transporte HTTP com SSE (Server-Sent Events) conforme a especificação MCP. Neste modo, clientes abrem uma conexão SSE (GET) para receber mensagens do servidor e enviam requisições POST para o endpoint fornecido pelo evento `endpoint`.
- **Modo padrão:** `stdio` (iniciado via `node dist/index.js` ou `./run-mcp.sh`).
- **Variáveis de ambiente relevantes:**

  - `MCP_TRANSPORT` — `http` para ativar HTTP/SSE (padrão: `stdio`)
  - `MCP_HTTP_HOST` — host a ser ligado (padrão: `127.0.0.1`)
  - `MCP_HTTP_PORT` — porta do servidor HTTP (padrão: `3100`)
  - `MCP_HTTP_PATH` — caminho do endpoint MCP (padrão: `/mcp`)
  - `MCP_ALLOWED_ORIGINS` — lista separada por vírgulas de origins permitidos (opcional)
  - `MCP_SESSION_MODE` — `stateful` (padrão) ou `stateless`

- **Como iniciar (exemplo local):**

```bash
# usar o script npm incluído (inicia em 127.0.0.1:3100)
npm run start:http

# ou explicitamente
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 MCP_HTTP_PORT=3100 node dist/index.js
```

- **Segurança:** o servidor valida o header `Origin` para mitigar ataques de DNS rebinding. Em implantação local, o servidor por padrão liga somente em `127.0.0.1`.

- **Comportamento do cliente:**
  - Cliente abre `GET http://127.0.0.1:3100/mcp` para iniciar SSE. O servidor responde com um evento `endpoint` que contém a URI para envio de mensagens (POST).
  - O cliente envia mensagens JSON-RPC via `POST` para a URI indicada.

Adicione testes de integração HTTP/SSE para verificar o evento `endpoint` e o fluxo POST/response quando desejar validar interoperabilidade.

### Verificar configuração MCP

Depois de configurar o MCP, você pode verificar se está funcionando corretamente:

1. **Reiniciar a aplicação** (Claude Desktop, etc.)
2. **Usar ferramenta de diagnóstico**:
   ```
   oracle_health_check()
   ```
3. **Testar consulta básica**:
   ```
   oracle_query("SELECT 1 FROM DUAL")
   ```

### Variáveis de Ambiente Principais

```bash
# Configuração básica
ORACLE_HOST=localhost
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=XE
ORACLE_USERNAME=hr
ORACLE_PASSWORD=hr

# Ou usar connection string completa
ORACLE_CONNECTION_STRING="(DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=XE)))"

# Para versões antigas do Oracle (pré-11g)
ORACLE_OLD_CRYPTO=true
ORACLE_CLIENT_LIB_DIR=/caminho/para/instantclient
```

### Configuração Baseada em Java Existente

Baseado na configuração Java fornecida:

```bash
ORACLE_HOST=host
ORACLE_PORT=port
ORACLE_SERVICE_NAME=service
ORACLE_USERNAME=user
ORACLE_PASSWORD=password
ORACLE_OLD_CRYPTO=true
ORACLE_FETCH_SIZE=100  # Baseado em DataSourceCrmConfig.java
```

### Pool de Conexões

```bash
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_POOL_INCREMENT=1
ORACLE_POOL_TIMEOUT=60
ORACLE_STMT_CACHE_SIZE=30
```

## 🚀 Uso

### Iniciar o servidor
```bash
npm run start
```

### Modo desenvolvimento
```bash
npm run dev
```

### Com inspector MCP
```bash
npm run inspector
```

## 📚 Exemplos de Uso

### Consulta Simples
```sql
SELECT * FROM employees WHERE department_id = 10
```

### Criar Tabela
```sql
CREATE TABLE test_table (
    id NUMBER PRIMARY KEY,
    name VARCHAR2(100) NOT NULL,
    created_date DATE DEFAULT SYSDATE
)
```

### Inserir Dados
```sql
INSERT INTO test_table (id, name) VALUES (1, 'Test Record')
```

### Transação Complexa
```sql
-- Comando 1
INSERT INTO customers (id, name) VALUES (1, 'Cliente Test');
-- Comando 2  
UPDATE orders SET customer_id = 1 WHERE id = 100;
-- Comando 3
DELETE FROM temp_data WHERE processed = 'Y';
```

## 🔧 Solução de Problemas

### ⚠️ Erro Oracle 9g: Password Verifier Not Supported
Se você receber o erro "password verifier type 0x939 is not supported by node-oracledb in Thin mode" com **Oracle 9g**:

**Solução OBRIGATÓRIA para Oracle 9g:**

### 📦 Passo 1: Baixar o Oracle Instant Client 19.26
```bash
# Baixar de:
# https://download.oracle.com/otn_software/nt/instantclient/1926000/instantclient-basic-windows.x64-19.26.0.0.0dbru.zip

# Extrair para:
C:\oracle\instantclient_19_26
```

### ⚙️ Passo 2: Configurar variáveis obrigatórias
```bash
ORACLE_OLD_CRYPTO=true
ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_19_26
```

### 🚀 Para versões Oracle 10g-11g: Tentar sem o Instant Client primeiro
```bash
ORACLE_OLD_CRYPTO=true
```

### 📦 Se falhar com 10g-11g, instalar o Oracle Instant Client
1. **Baixar o Oracle Instant Client:**
   - Windows: [Oracle Instant Client para Windows](https://www.oracle.com/database/technologies/instant-client/winx64-downloads.html)
   - Linux: [Oracle Instant Client para Linux](https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html)
   - macOS: [Oracle Instant Client para macOS](https://www.oracle.com/database/technologies/instant-client/macos-intel-x86-downloads.html)

2. **Configurar o caminho:**
```bash
ORACLE_CLIENT_LIB_DIR=/caminho/para/instantclient
```

### 📋 Exemplos de configuração:

**Configuração básica (testar primeiro):**
```bash
ORACLE_HOST=seu-host-oracle
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=seu-servico
ORACLE_USERNAME=usuario
ORACLE_PASSWORD=senha
ORACLE_OLD_CRYPTO=true
```

**Configuração com Instant Client (se necessário):**
```bash
ORACLE_HOST=seu-host-oracle
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=seu-servico
ORACLE_USERNAME=usuario
ORACLE_PASSWORD=senha
ORACLE_OLD_CRYPTO=true
ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_19_8
```

### ❓ O que é o Oracle Instant Client?

O Oracle Instant Client são bibliotecas nativas que permitem conexões **Thick** (mais compatíveis com Oracle antigo).

**Quando é necessário?**
- ✅ **NÃO necessário**: Se o seu Oracle for 12c ou superior
- ⚠️ **Pode ser necessário**: Para Oracle 10g/11g com criptografia antiga
- ❌ **Obrigatório**: Para funções avançadas (LDAP, conexões wallet, etc.)

**Como saber se eu preciso?**
1. Teste primeiro apenas com `ORACLE_OLD_CRYPTO=true`
2. Se receber erros, então instale o Oracle Instant Client

### 📦 Instalação do Oracle Instant Client (Apenas se necessário)

**Windows:**
1. Baixe o "Basic Package" de [Oracle Downloads](https://www.oracle.com/database/technologies/instant-client/winx64-downloads.html)
2. Extraia para `C:\oracle\instantclient_XX_Y`
3. Configure: `ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_XX_Y`

**Linux:**
```bash
# Ubuntu/Debian
wget https://download.oracle.com/otn_software/linux/instantclient/XXX/instantclient-basic-linux.x64-XX.Y.Z.zip
unzip instantclient-basic-linux.x64-XX.Y.Z.zip
export ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_XX_Y
```

**macOS:**
```bash
# Baixar da Oracle e extrair
export ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_XX_Y
```

### Erro de Conexão TNS
Verificar:
1. Host e porta corretos
2. Serviço/SID configurado
3. Firewall/conectividade de rede
4. Listener do Oracle em execução

### Problemas de Pool
```bash
# Ajustar configuração do pool
ORACLE_POOL_MIN=1
ORACLE_POOL_MAX=5
ORACLE_POOL_TIMEOUT=30
```

## 🧪 Testes

```bash
npm test
```

## 📖 Compatibilidade

- **Oracle Database**: 11g, 12c, 18c, 19c, 21c
- **Node.js**: >=18.0.0
- **Sistemas**: Windows, Linux, macOS

## 🔐 Segurança

- Validação de SQL para prevenir injeções básicas
- Gestão segura de credenciais via variáveis de ambiente
- Suporte para conexões SSL/TLS do Oracle
- Separação de permissões entre consultas e comandos

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para a feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas alterações (`git commit -am 'Adicionar nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Crie um Pull Request

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para mais detalhes.

## 🆘 Suporte

Para reportar problemas ou solicitar funcionalidades:
- GitHub Issues: [github.com/gcorroto/mcp-oracle-db/issues](https://github.com/gcorroto/mcp-oracle-db/issues)

## 📚 Recursos Adicionais

- [Oracle Database Documentation](https://docs.oracle.com/database/)
- [node-oracledb Documentation](https://oracle.github.io/node-oracledb/)
- [Model Context Protocol](https://modelcontextprotocol.io/)