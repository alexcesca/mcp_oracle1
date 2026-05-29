# Instruções de Instalação - MCP Oracle Database

## 📋 Pré-requisitos

### 1. Node.js e npm
```bash
# Verificar se o Node.js >= 18.0.0 está instalado
node --version
npm --version
```

### 2. Oracle Instant Client
- **Download**: [Oracle Instant Client Downloads](https://www.oracle.com/database/technologies/instant-client/downloads.html)
- **Versão recomendada**: 19c ou superior
- **Componentes necessários**: Basic Package + SQL*Plus Package (opcional)

#### Windows:
1. Baixe o arquivo `instantclient-basic-windows.x64-19.X.X.X.X.zip`
2. Extraia em `C:\oracle\instantclient_19_X`
3. Adicione ao PATH: `C:\oracle\instantclient_19_X`

#### Linux:
```bash
# Ubuntu/Debian
sudo apt-get install libaio1
# CentOS/RHEL
sudo yum install libaio

# Baixar e extrair
wget https://download.oracle.com/otn_software/linux/instantclient/19XX/instantclient-basic-linux.x64-19.X.X.X.X.zip
sudo unzip instantclient-basic-linux.x64-19.X.X.X.X.zip -d /opt/oracle
```

#### macOS:
```bash
# Com Homebrew
brew install --cask oracle-jdk
# Ou baixar manualmente da Oracle
```

## 🛠️ Instalação

### 1. Clonar/Obter o código
```bash
# Se estiver no Git
git clone [repository-url]
cd mcp-oracle-db

# Ou simplesmente navegar para o diretório do projeto
cd mcp-oracle-db
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
# Copiar o arquivo de configuração de exemplo
cp config.example.env .env

# Editar o .env com a configuração do seu banco de dados
```

### 4. Configuração para seu ambiente AYG (baseado no application-local.properties)

Editar o `.env` com estes valores:

```bash
# === CONFIGURAÇÃO PARA AYGDES ===
ORACLE_HOST=host
ORACLE_PORT=port
ORACLE_SERVICE_NAME=service
ORACLE_USERNAME=user
ORACLE_PASSWORD=pass

# === IMPORTANTE: Para Oracle pré-12c ===
ORACLE_OLD_CRYPTO=true

# === CONFIGURAÇÃO DE POOL ===
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=5
ORACLE_POOL_INCREMENT=1
ORACLE_POOL_TIMEOUT=60

# === CONFIGURAÇÃO DE DESEMPENHO ===
ORACLE_FETCH_SIZE=100
ORACLE_STMT_CACHE_SIZE=30
```

### 5. Compilar o projeto
```bash
npm run build
```

### 6. Verificar instalação
```bash
# Executar testes básicos
npm test

# Ou verificar configuração manualmente
node dist/index.js
```

## 🚀 Execução

### Método 1: Scripts de conveniência
```bash
# Windows
./run-mcp.bat

# Linux/macOS
./run-mcp.sh
```

### Método 2: npm scripts
```bash
# Desenvolvimento (rebuild automático)
npm run dev

# Produção
npm run start

# Com inspector MCP
npm run inspector
```

### Método 3: Direto
```bash
# Garantir que esteja compilado
npm run build

# Executar
node dist/index.js
```

## 🔧 Solução de Problemas Comuns

### Erro: "Cannot find module 'oracledb'"
```bash
# Reinstalar o oracledb
npm uninstall oracledb
npm install oracledb
```

### Erro: "DPI-1047: Cannot locate an Oracle Client library"
**Windows:**
```cmd
# Verificar PATH
echo %PATH%
# Deve incluir C:\oracle\instantclient_XX_X

# Verificar se os arquivos existem
dir C:\oracle\instantclient_XX_X\*.dll
```

**Linux:**
```bash
# Configurar LD_LIBRARY_PATH
export LD_LIBRARY_PATH=/opt/oracle/instantclient_XX_X:$LD_LIBRARY_PATH

# Ou criar /etc/ld.so.conf.d/oracle-instantclient.conf
echo "/opt/oracle/instantclient_XX_X" | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
sudo ldconfig
```

### Erro: "ORA-01017: invalid username/password"
- Verificar credenciais no `.env`

### Erro: "ORA-12154: TNS:could not resolve..."
- Verificar host e porta
- Verificar conectividade de rede:
```bash
telnet srvaygdes01.clouddesprivada.vcndes.oraclevcn.com 1521
```

### Erro: Problemas de criptografia
```bash
# No .env
ORACLE_OLD_CRYPTO=true

# Se persistir, configurar variáveis adicionais:
ORACLE_CLIENT_LIB_DIR=/caminho/para/instantclient
```

### Erro: "Pool is closed"
```bash
# Reiniciar o servidor MCP
# Verificar configuração do pool no .env
ORACLE_POOL_MIN=1
ORACLE_POOL_MAX=3
ORACLE_POOL_TIMEOUT=30
```

## 📚 Configuração Avançada

### Connection String personalizado
```bash
# Em vez de host/port/service individual
ORACLE_CONNECTION_STRING="(DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=srvaygdes01.clouddesprivada.vcndes.oraclevcn.com)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=AYGDES)))"
```

### SSL/TLS
```bash
# Para conexões seguras
ORACLE_CONNECTION_STRING="(DESCRIPTION=(ADDRESS=(PROTOCOL=tcps)(HOST=hostname)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=service)))"
```

### Múltiplos esquemas
```bash
# Criar múltiplos arquivos .env
cp .env .env.desenvolvimento
cp .env .env.producao

# Usar conforme a necessidade
export NODE_ENV=desenvolvimento
```

## 🧪 Verificação

### 1. Teste de conexão básica
```bash
npm test
```

### 2. Teste manual com o MCP Inspector
```bash
npm run inspector
```

### 3. Teste com ferramentas MCP
- Usar `oracle_health_check` para verificar a conexão
- Usar `oracle_query` com `SELECT 1 FROM DUAL`
- Usar `oracle_list_tables` para explorar o esquema

## 📞 Suporte

Se tiver problemas:

1. **Verificar logs**: Os erros são exibidos no console
2. **Verificar configuração**: Usar `oracle_info` para ver a configuração atual
3. **Verificar conectividade**: Testar com ferramentas Oracle nativas
4. **Documentação**: Consultar o README.md para mais detalhes

## 📝 Notas Específicas para AYG

- A configuração é baseada no `application-local.properties`
- Foi configurado `ORACLE_OLD_CRYPTO=true` para compatibilidade
- O `fetch_size` está configurado para 100 (igual ao Java)
- Pool configurado com valores conservadores para desenvolvimento