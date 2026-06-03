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
- Usar `oracle_query` para explorar o esquema

## 🥛 Artigo Técnico: Implementação da Tool `oracle_resumo_programacao_leite`

### Resumo

Este artigo descreve, de ponta a ponta, a implementação da tool `oracle_resumo_programacao_leite` no servidor MCP Oracle. O objetivo é documentar o comportamento funcional, o fluxo técnico, os guardrails de segurança, o contrato de entrada/saída e a relação com o protocolo Model Context Protocol (MCP).

A tool foi desenhada para executar um processo de negócio específico (programação de leite OBI), garantindo previsibilidade operacional e segurança na geração de SQL dinâmico.

### Contexto MCP e referência técnica

No MCP, uma tool é exposta pelo servidor e invocada por cliente via chamadas JSON-RPC. Nesta implementação:

1. O servidor registra a tool com nome, descrição e schema Zod.
2. O cliente MCP descobre as tools disponíveis.
3. O cliente executa a tool por meio de chamada `tools/call`.
4. O servidor valida os parâmetros, executa a lógica de domínio e retorna conteúdo estruturado.

Referência conceitual usada no desenho:

- Model Context Protocol: descoberta e invocação de tools
- JSON-RPC 2.0: estrutura de request/response
- Streamable HTTP transport: canal de transporte para execução remota

### Problema de negócio que a tool resolve

A tool executa o pipeline de geração de resumo em três estágios:

1. prepara o staging (`DELETE` da tabela de resumo),
2. executa a procedure de carga (`PK_LAC_OBI.PKB_GERA_PROGLEI`),
3. consulta agregada em `resumo_programacao_leite_obi` com agrupamentos e somatórios controlados.

Esse desenho evita que o cliente precise conhecer detalhes internos do Oracle, padronizando a operação em uma única chamada MCP.

### Contrato de entrada

Parâmetros da tool:

- `dtInic` (opcional): data inicial, formato `YYYY-MM-DD`
- `dtFim` (opcional): data final, formato `YYYY-MM-DD`
- `sistema` (opcional, padrão `OBI`)
- `processo` (opcional, padrão `MCP`)
- `somatorios` (obrigatório, mínimo 1):
	- `quantidade_total_entregue` -> `TOT_REAL_DEST`
	- `quantidade_prevista` -> `QTDE_PREV_DEST`
	- `quantidade_programada` -> `QTDE_PROG`
- `agruparPor` (obrigatório, mínimo 1):
	- `unidade` -> `CD_UNID_ORIG`
	- `fornecedor` -> `FORN_ID_ORIG`
	- `filiada` -> `CD_FILI_ORIG`
	- `posto` -> `CD_POSTO_ORIG`
	- `produto_analisado` -> `DESCR_MATERANALI`
- `filtros` (opcional): mapa de filtros por dimensão permitida
- `maxRows` (opcional, padrão `200`, faixa `1..1000`)
- `formatAsTable` (opcional, padrão `true`)

### Fluxo de execução implementado

#### Etapa 1: resolução de período

A função `resolvePeriod` aplica as regras:

- sem `dtInic` e `dtFim`: usa automaticamente o mês atual,
- com apenas uma das datas: erro de validação,
- com `dtInic > dtFim`: erro de período invertido,
- com datas inválidas: erro de formato/consistência.

#### Etapa 2: limpeza de dados de resumo

Executa:

```sql
DELETE FROM resumo_programacao_leite_obi
```

Com `autoCommit: true`, garantindo staging limpo antes da carga.

#### Etapa 3: execução da procedure

Executa bloco PL/SQL:

```sql
BEGIN
	PK_LAC_OBI.PKB_GERA_PROGLEI(
		ed_dt_inic => :ed_dt_inic,
		ed_dt_fim => :ed_dt_fim,
		sv_sistema => :sv_sistema,
		sv_processo => :sv_processo,
		sv_msg_erro => :sv_msg_erro,
		sn_cd_erro => :sn_cd_erro
	);
END;
```

Binds de saída:

- `sv_msg_erro`: texto de retorno da procedure
- `sn_cd_erro`: código funcional

Se `sn_cd_erro` for diferente de zero, a tool retorna erro funcional explícito para o cliente MCP.

#### Etapa 4: construção do SQL de agregação

A função `buildLeiteAggregationQuery` cria SQL dinâmico com:

- allowlist estrita para somatórios e agrupamentos,
- validação de identificadores SQL,
- filtros opcionais via bind variables,
- ordenação pelo primeiro somatório solicitado,
- limite por `ROWNUM <= :maxRows`.

Também adiciona colunas companion (nome/descrição) quando aplicável, com deduplicação.

#### Etapa 5: execução da agregação e retorno

A consulta é executada por `executeQuery` e o retorno da tool contém:

- período efetivo utilizado,
- somatórios e agrupamentos aplicados,
- total de linhas retornadas,
- tempo total (procedure + query),
- resultado em tabela ou JSON,
- mensagem da procedure quando presente,
- lista de campos permitidos.

### Guardrails de segurança e consistência

Medidas implementadas:

- validação de período e formato de data,
- bloqueio de campos fora da allowlist,
- bloqueio de filtros não permitidos,
- proteção contra SQL injection via bind variables,
- validação de identificadores com `isValidSqlIdentifier`,
- limite obrigatório de volume de retorno.

### Exemplo técnico de uso via MCP

Payload típico para `tools/call`:

```json
{
	"name": "oracle_resumo_programacao_leite",
	"arguments": {
		"dtInic": "2026-05-01",
		"dtFim": "2026-05-31",
		"sistema": "OBI",
		"processo": "MCP",
		"somatorios": ["quantidade_total_entregue", "quantidade_programada"],
		"agruparPor": ["unidade", "fornecedor"],
		"filtros": {
			"unidade": "U01"
		},
		"maxRows": 200,
		"formatAsTable": true
	}
}
```

### Testabilidade e cobertura existente

Os testes atuais validam:

- período padrão automático,
- erro para período parcial,
- erro para período invertido,
- montagem de SQL com colunas físicas esperadas,
- bloqueio de somatório inválido,
- bloqueio de agrupamento inválido,
- bloqueio de filtro não permitido.

### Considerações finais

A implementação da tool `oracle_resumo_programacao_leite` segue um padrão de integração orientado a domínio no MCP: entrada validada, execução determinística, SQL seguro e resposta autoexplicativa. Com isso, clientes MCP conseguem executar um processo Oracle complexo com uma única chamada de tool, mantendo governança técnica e previsibilidade operacional.

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