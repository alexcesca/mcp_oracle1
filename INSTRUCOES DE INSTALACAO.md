# Instruções de Instalação - MCP Oracle Database

## 📋 Pré-requisitos

### 1. Node.js e npm
```bash
# Verificar se o Node.js >= 18.0.0 está instalado
node --version
npm --version
```

### 2. Oracle Instant Client
> [!NOTE]
> O driver `node-oracledb` deste projeto roda por padrão em modo **Thin** para se conectar a bancos Oracle 19c ou superiores.
> * **Não é necessária** a instalação do Oracle Instant Client na máquina física (nem localmente, nem para rodar via Docker).
> * **Banco de dados local**: Também **nunca é necessário**, pois o projeto conecta-se diretamente à sua instância remota do Oracle Database.



## 🐳 Execução Simplificada via Docker e Docker Compose (Recomendado)

Se você preferir evitar instalar manualmente o Node.js, compilar pacotes nativos e configurar o Oracle Instant Client na sua máquina física, a execução via **Docker** é o caminho recomendado. Todo o ambiente necessário (incluindo o Oracle Instant Client 19.19) já está embutido na imagem do container.

### Passo 1: Configurar arquivo de ambiente `.env`
Antes de subir os containers, copie o arquivo de configuração de exemplo para `.env` e ajuste as credenciais do seu banco de dados:
```bash
cp config.example.env .env
```

### Passo 2: Inicializar o Container

O projeto foi configurado para trabalhar **exclusivamente com o transporte Streamable HTTP (SSE)**. Para iniciar:

```bash
docker-compose up -d
```
O endpoint do servidor MCP estará pronto para receber conexões SSE em: `http://localhost:3100/mcp`.

---


## 🛠️ Instalação Manual (Sem Docker)


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

# === CONFIGURAÇÃO DE POOL ===
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=5
ORACLE_POOL_INCREMENT=1
ORACLE_POOL_TIMEOUT=60

# === CONFIGURAÇÃO DE DESEMPENHO ===
ORACLE_FETCH_SIZE=100
ORACLE_STMT_CACHE_SIZE=30
```

### 5. Compilar o projeto (Opcional)
> [!NOTE]
> O projeto utiliza `tsx` para rodar os arquivos TypeScript diretamente em tempo de desenvolvimento e produção. O passo de compilação é opcional e gera a pasta `dist` com os arquivos compilados em JavaScript.
```bash
npm run build
```

### 6. Verificar instalação
```bash
# Executar testes básicos
npm test

# Ou verificar execução do servidor manualmente com tsx
npx tsx index.ts
```

## 🚀 Execução

Como o projeto está configurado para utilizar `tsx` (TypeScript Execute), você pode iniciar o servidor diretamente a partir dos arquivos fonte sem precisar compilar previamente para a pasta `dist`.

### Método 1: Scripts de conveniência (Recomendado)
Estes scripts carregam automaticamente as variáveis de ambiente do arquivo `.env` local:
```bash
# Windows
run-mcp.bat

# Linux/macOS
./run-mcp.sh
```

### Método 2: npm scripts
```bash
# Executar o servidor com recarregamento rápido
npm run dev

# Executar em modo produção (via tsx)
npm run start

# Executar com a ferramenta MCP Inspector para testes interativos
npm run inspector
```

### Método 3: Executar a partir da compilação (Caso tenha gerado a pasta dist)
Se você executou `npm run build` e deseja rodar o JavaScript compilado nativamente no Node:
```bash
node dist/index.js
```

## 🔧 Solução de Problemas Comuns

### Erro: "Cannot find module 'oracledb'"
```bash
# Reinstalar o oracledb
npm uninstall oracledb
npm install oracledb
```



### Erro: "ORA-01017: invalid username/password"
- Verificar credenciais no `.env`

### Erro: "ORA-12154: TNS:could not resolve..."
- Verificar host e porta
- Verificar conectividade de rede:
```bash
telnet srvaygdes01.clouddesprivada.vcndes.oraclevcn.com 1521
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
- Usar `oracle_query` para explorar o esquema

## 📞 Suporte

Se tiver problemas:

1. **Verificar logs**: Os erros são exibidos no console
2. **Verificar configuração**: Usar `oracle_info` para ver a configuração atual
3. **Verificar conectividade**: Testar com ferramentas Oracle nativas
4. **Documentação**: Consultar o README.md para mais detalhes

## 📝 Notas Específicas para AYG

- A configuração é baseada no `application-local.properties`
- O `fetch_size` está configurado para 100 (igual ao Java)
- Pool configurado com valores conservadores para desenvolvimento