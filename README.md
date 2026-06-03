# MCP Oracle Database Server

Servidor MCP (Model Context Protocol) para integração completa com Oracle Database. Permite executar consultas SQL, comandos DDL/DML, gerenciar transações e explorar a estrutura do banco de dados diretamente de aplicações MCP.

## 🚀 Características

- **Consultas SQL**: Executa SELECT com formatação inteligente de resultados
- **Comandos DML/DDL**: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.
- **Gestão de Transações**: Suporte para transações manuais e automáticas
- **Exploração de BD**: Lista tabelas, descreve estruturas, explora esquemas
- **Pool de Conexões**: Gestão eficiente de conexões com Oracle
- **Compatibilidade**: Otimizado para Oracle Database 19c ou superior
- **Monitoramento**: Health checks e estatísticas de conexão

## 📋 Ferramentas Disponíveis

### `oracle_health_check`
Verifica o estado de saúde da conexão Oracle DB.

### `oracle_query`
Executa consultas SQL SELECT com formato de tabela ou JSON.
- **Parâmetros**: `sql`, `maxRows`, `formatAsTable`, `showMetadata`

### `oracle_info`
Mostra informações de configuração da conexão.

### `oracle_resumo_programacao_leite`
Executa `PK_LAC_OBI.PKB_GERA_PROGLEI` para o período solicitado e, em seguida, consulta a tabela `resumo_programacao_leite_obi` com somatórios e agrupamentos controlados por allowlist.
- **Parâmetros**: `dtInic`, `dtFim`, `sistema`, `processo`, `somatorios`, `agruparPor`, `filtros`, `maxRows`, `formatAsTable`
- **Comportamento de período**: quando `dtInic` e `dtFim` não são informadas, usa automaticamente o mês atual; se apenas uma data for informada, retorna erro de validação.
- **Campos permitidos (somatórios)**: `quantidade_total_entregue`, `quantidade_prevista`, `quantidade_programada`
- **Campos permitidos (agrupamentos/filtros)**: `unidade`, `fornecedor`, `filiada`, `posto`, `produto_analisado`

## 🛠️ Instalação

### 🐳 1. Execução via Docker e Docker Compose (Altamente Recomendado)

A execução via Docker é o método mais simples e recomendado, pois **o container já vem com o Oracle Instant Client instalado e configurado automaticamente**. Isso evita a necessidade de baixar pacotes do Oracle, instalar dependências nativas (como `libaio`) ou gerenciar o `LD_LIBRARY_PATH` no seu próprio sistema operacional.

O projeto foi configurado para trabalhar **exclusivamente com o transporte Streamable HTTP (SSE)**.

Certifique-se de ter o Docker e o Docker Compose instalados e o arquivo `.env` configurado na raiz do projeto.

#### Inicialização do Serviço HTTP/SSE (Porta 3100)
1. Inicie o container:
   ```bash
   docker-compose up -d
   ```
2. O servidor MCP estará ativo e pronto para receber conexões SSE no endpoint:
   `http://localhost:3100/mcp`

---

### 💻 2. Execução Local com Scripts de Conveniência (Sem Docker)

Se preferir rodar localmente fora do Docker e já tiver o Node e o Oracle Client configurados no seu sistema, você pode usar os scripts utilitários `run-mcp.sh` (Linux/macOS) ou `run-mcp.bat` (Windows) para iniciar o servidor Streamable HTTP localmente.

Estes scripts:
* Verificam a existência do arquivo `.env`.
* Carregam as variáveis de ambiente automaticamente.
* Iniciam o servidor Streamable HTTP usando o runner `tsx` na porta configurada (ou padrão `3100`).

Para iniciar o servidor via script:
* **Linux/macOS**:
  ```bash
  ./run-mcp.sh
  ```
* **Windows**:
  ```cmd
  run-mcp.bat
  ```

Após iniciado, conecte seus clientes MCP (como Cursor ou MCP Inspector) ao endpoint:
`http://localhost:3100/mcp`

---

### 💻 3. Instalação Geral MCP LOCAL (Desenvolvimento Manual)


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

**Configuração recomendada (Oracle 19c ou superior):**
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

#### Para instalação local (direto do código fonte)

**Opção A: Rodar via `tsx` (Sem precisar compilar)**
```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "npx",
      "args": ["tsx", "C:/workspaces/mcps/mcp-oracle-db/index.ts"],
      "env": {
        "ORACLE_HOST": "host",
        "ORACLE_PORT": "port",
        "ORACLE_SERVICE_NAME": "service",
        "ORACLE_USERNAME": "user",
        "ORACLE_PASSWORD": "pass"
      }
    }
  }
}
```

**Opção B: Rodar via `node` (Requer compilação prévia via `npm run build`)**
```json
{
  "mcpServers": {
    "oracle-db": {
      "command": "node",
      "args": ["C:/workspaces/mcps/mcp-oracle-db/dist/index.js"],
      "env": {
        "ORACLE_HOST": "host",
        "ORACLE_PORT": "port",
        "ORACLE_SERVICE_NAME": "service",
        "ORACLE_USERNAME": "user",
        "ORACLE_PASSWORD": "pass"
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

---

### ⚙️ Configuração para VS Code (com GitHub Copilot / Extensão MCP)

O VS Code pode se conectar ao servidor MCP Oracle através do protocolo **Streamable HTTP (SSE)**, o que é ideal quando o servidor roda remotamente em um container Docker.

> [!IMPORTANT]
> O servidor MCP precisa estar **em execução** antes de abrir o VS Code. Certifique-se de que o container Docker está rodando e a porta `3100` está acessível a partir da sua máquina.

#### Pré-requisito: Iniciar o Servidor Docker

Na máquina remota (ou localmente), execute:
```bash
docker-compose up -d
```
O servidor ficará disponível em: `http://<IP-DO-SERVIDOR>:3100/mcp`

#### Configuração do VS Code

Existem duas formas de configurar o MCP no VS Code:

**Opção 1: Via arquivo de workspace (`.vscode/mcp.json`)** *(recomendado para projetos)*

Crie ou edite o arquivo `.vscode/mcp.json` na raiz do seu projeto:
```json
{
  "servers": {
    "oracle-db": {
      "type": "http",
      "url": "http://<IP-DO-SERVIDOR>:3100/mcp"
    }
  }
}
```

**Opção 2: Via configuração global do usuário (`settings.json`)**

Abra as configurações do VS Code (`Ctrl+Shift+P` → `Open User Settings (JSON)`) e adicione:
```json
{
  "mcp": {
    "servers": {
      "oracle-db": {
        "type": "http",
        "url": "http://<IP-DO-SERVIDOR>:3100/mcp"
      }
    }
  }
}
```

> [!NOTE]
> Substitua `<IP-DO-SERVIDOR>` pelo endereço IP da máquina que está rodando o container Docker. Se for local, use `localhost` ou `127.0.0.1`.

#### Exemplos por cenário

**Servidor Docker rodando localmente:**
```json
{
  "servers": {
    "oracle-db": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

**Servidor Docker rodando em máquina remota da rede:**
```json
{
  "servers": {
    "oracle-db": {
      "type": "http",
      "url": "http://192.168.1.100:3100/mcp"
    }
  }
}
```

**Servidor Docker com acesso via hostname:**
```json
{
  "servers": {
    "oracle-db": {
      "type": "http",
      "url": "http://meu-servidor-dev:3100/mcp"
    }
  }
}
```

#### Verificar Conexão no VS Code

Após configurar, acesse o painel **GitHub Copilot Chat** (ou a extensão MCP instalada) e use:
- `#oracle_health_check` — para verificar se a conexão está ativa
- `#oracle_query` com `SELECT 1 FROM DUAL` — para testar uma consulta básica

> [!TIP]
> Se o servidor for remoto e estiver em rede corporativa ou VPN, certifique-se de que a porta `3100` está liberada no firewall da máquina servidora. Para verificar a conectividade: `telnet <IP-DO-SERVIDOR> 3100`

---

## **HTTP/SSE Transport**


- **Resumo:** O servidor suporta o transporte HTTP com SSE (Server-Sent Events) conforme a especificação MCP. Neste modo, clientes abrem uma conexão SSE (GET) para receber mensagens do servidor e enviam requisições POST para o endpoint fornecido pelo evento `endpoint`.
- **Modo padrão:** HTTP/SSE com StreamableHTTPServerTransport.
- **Variáveis de ambiente relevantes:**

  - `MCP_HTTP_HOST` — host a ser ligado (padrão: `127.0.0.1`)
  - `MCP_HTTP_PORT` — porta do servidor HTTP (padrão: `3100`)
  - `MCP_HTTP_PATH` — caminho do endpoint MCP (padrão: `/mcp`)
  - `MCP_ALLOWED_ORIGINS` — lista separada por vírgulas de origins permitidos (opcional)
  - `MCP_SESSION_MODE` — `stateful` (padrão) ou `stateless`

- **Como iniciar (exemplo local):**

```bash
# usar o script npm incluído (inicia em 127.0.0.1:3100)
npm run start:http

# ou explicitamente usando tsx
MCP_HTTP_HOST=127.0.0.1 MCP_HTTP_PORT=3100 npx tsx index.ts

# ou compilado (requer build)
MCP_HTTP_HOST=127.0.0.1 MCP_HTTP_PORT=3100 node dist/index.js
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
```

### Configuração Baseada em Java Existente

Baseado na configuração Java fornecida:

```bash
ORACLE_HOST=host
ORACLE_PORT=port
ORACLE_SERVICE_NAME=service
ORACLE_USERNAME=user
ORACLE_PASSWORD=password
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
SELECT 1 FROM dual
```

## 🔧 Solução de Problemas

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