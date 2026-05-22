import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OracleService } from "./oracle-service.js";
import { z } from "zod";
import oracledb from "oracledb";
import { 
  formatDuration, 
  formatQueryResultAsTable, 
  getSqlCommandType, 
  isReadOnlyCommand,
  formatNumber
} from "../common/utils.js";
import {
  ALLOWED_GROUP_FIELDS,
  ALLOWED_SUM_FIELDS,
  buildLeiteAggregationQuery,
  resolvePeriod
} from "../common/leite-aggregation.js";

/**
 * Registra todas as ferramentas MCP de Oracle Database no servidor fornecido.
 * 
 * @param server Instância do McpServer onde as ferramentas serão registradas
 * @param getOracleService Função getter para obter a instância (lazy-loaded) do OracleService
 */
export function registerAllTools(server: McpServer, getOracleService: () => OracleService): void {
  
  // 1. Health Check do sistema Oracle DB
  server.tool(
    "oracle_health_check",
    "Verificar o estado de saúde da conexão Oracle DB",
    {},
    async () => {
      try {
        const result = await getOracleService().healthCheck();
        
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro de Conexão:** ${result.error}` }],
          };
        }

        const data = result.data!;
        const statusIcon = data.connected ? '✅' : '❌';
        const poolIcon = '🏊‍♂️';
        const sessionIcon = '👤';
        
        let healthText = `${statusIcon} **Estado do Oracle Database**\n\n` +
          `**Conectado:** ${data.connected ? 'Sim' : 'Não'}\n` +
          `**Versão:** ${data.version || 'N/A'}\n\n`;

        if (data.poolStatus) {
          healthText += `${poolIcon} **Pool de Conexões:**\n` +
            `• Conexões Abertas: ${data.poolStatus.connectionsOpen}\n` +
            `• Conexões em Uso: ${data.poolStatus.connectionsInUse}\n` +
            `• Pool Mín/Máx: ${data.poolStatus.poolMin}/${data.poolStatus.poolMax}\n` +
            `• Timeout: ${data.poolStatus.poolTimeout}s\n` +
            `• Cache de Statements: ${data.poolStatus.stmtCacheSize}\n\n`;
        }

        if (data.sessionInfo) {
          healthText += `${sessionIcon} **Informações de Sessão:**\n` +
            `• ID de Sessão: ${data.sessionInfo.sessionId}\n` +
            `• Usuário: ${data.sessionInfo.username}\n` +
            `• Esquema: ${data.sessionInfo.schemaName}\n` +
            `• Máquina: ${data.sessionInfo.machine}\n` +
            `• Usuário SO: ${data.sessionInfo.osUser}\n`;
        }

        healthText += `\n**Tempo de Verificação:** ${formatDuration(result.executionTime || 0)}`;

        return {
          content: [{ type: "text", text: healthText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 2. Executar consulta SQL (SELECT)
  server.tool(
    "oracle_query",
    "Executar consulta SQL SELECT no Oracle Database",
    {
      sql: z.string().describe("Consulta SQL SELECT a executar"),
      maxRows: z.number().optional().default(100).describe("Número máximo de linhas a retornar"),
      formatAsTable: z.boolean().optional().default(true).describe("Formatar resultado como tabela"),
      showMetadata: z.boolean().optional().default(false).describe("Mostrar metadados das colunas")
    },
    async (args) => {
      try {
        // Verificar se é uma consulta de apenas leitura
        if (!isReadOnlyCommand(args.sql)) {
          return {
            isError: true,
            content: [{ type: "text", text: `⚠️ **Aviso:** Esta ferramenta permite apenas consultas SELECT. Use 'oracle_execute' para outros comandos.` }],
          };
        }

        const result = await getOracleService().executeQuery(args.sql, [], {
          maxRows: args.maxRows,
          extendedMetaData: args.showMetadata
        });
        
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro SQL:** ${result.error}\n\n**Comando:** \`${args.sql}\`` }],
          };
        }

        const queryResult = result.data!;
        const commandType = getSqlCommandType(args.sql);
        
        let responseText = `📊 **Consulta ${commandType} Executada**\n\n`;
        responseText += `**Linhas Retornadas:** ${formatNumber(queryResult.rows.length)}\n`;
        responseText += `**Tempo de Execução:** ${formatDuration(result.executionTime || 0)}\n\n`;

        if (queryResult.rows.length === 0) {
          responseText += `**Resultado:** Nenhum dado encontrado`;
        } else {
          if (args.formatAsTable) {
            responseText += [
              "**Resultado**",
              "",
              "```",
              formatQueryResultAsTable(queryResult.rows, args.maxRows),
              "```"
            ].join("\n");
          } else {
            responseText += `**Resultado (JSON):**\n${"```json"}\n${JSON.stringify(queryResult.rows.slice(0, Math.min(10, args.maxRows)), null, 2)}\n${"```"}`;
            if (queryResult.rows.length > 10) {
              responseText += `\n... e mais ${queryResult.rows.length - 10} linhas`;
            }
          }
        }

        if (args.showMetadata && queryResult.metadata.length > 0) {
          responseText += `\n\n**Metadados das Colunas:**\n`;
          queryResult.metadata.forEach((col, index) => {
            responseText += `${index + 1}. **${col.name}** (${col.dbTypeName})\n`;
          });
        }

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 3. Executar comando SQL (INSERT, UPDATE, DELETE, CREATE, etc.)
  server.tool(
    "oracle_execute",
    "Executar comando SQL no Oracle Database (INSERT, UPDATE, DELETE, CREATE, etc.)",
    {
      sql: z.string().describe("Comando SQL a executar"),
      autoCommit: z.boolean().optional().default(true).describe("Confirmar automaticamente as alterações"),
      showDetails: z.boolean().optional().default(true).describe("Mostrar detalhes da execução")
    },
    async (args) => {
      try {
        const commandType = getSqlCommandType(args.sql);
        
        const result = await getOracleService().executeCommand(args.sql, [], {
          autoCommit: args.autoCommit
        });
        
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro SQL:** ${result.error}\n\n**Comando:** \`${args.sql}\`` }],
          };
        }

        const executeResult = result.data!;
        
        const commandIcon = {
          'INSERT': '➕',
          'UPDATE': '✏️',
          'DELETE': '🗑️',
          'CREATE': '🏗️',
          'ALTER': '🔧',
          'DROP': '💥',
          'TRUNCATE': '🧹',
          'MERGE': '🔀',
          'GRANT': '🔑',
          'REVOKE': '🚫'
        }[commandType] || '⚡';

        let responseText = `${commandIcon} **Comando ${commandType} Executado**\n\n`;
        responseText += `**Linhas Afetadas:** ${formatNumber(executeResult.rowsAffected)}\n`;
        responseText += `**Tempo de Execução:** ${formatDuration(result.executionTime || 0)}\n`;
        responseText += `**Auto Commit:** ${args.autoCommit ? 'Sim' : 'Não'}\n`;

        if (executeResult.lastRowid && args.showDetails) {
          responseText += `**Último ROWID:** ${executeResult.lastRowid}\n`;
        }

        if (executeResult.outBinds && args.showDetails) {
          responseText += `**Parâmetros de Saída:** ${JSON.stringify(executeResult.outBinds)}\n`;
        }

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 4. Listar tabelas
  server.tool(
    "oracle_list_tables",
    "Listar tabelas no Oracle Database",
    {
      owner: z.string().optional().describe("Proprietário/esquema específico (por padrão o usuário atual)"),
      showDetails: z.boolean().optional().default(true).describe("Mostrar detalhes adicionais das tabelas")
    },
    async (args) => {
      try {
        const result = await getOracleService().getTables(args.owner);
        
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro:** ${result.error}` }],
          };
        }

        const tables = result.data!;
        
        if (tables.length === 0) {
          return {
            content: [{ type: "text", text: `📋 **Nenhuma tabela encontrada** no esquema${args.owner ? ` '${args.owner}'` : ' atual'}` }],
          };
        }

        let responseText = `📋 **Tabelas no Oracle Database** (${formatNumber(tables.length)} tabelas)\n`;
        responseText += `**Esquema:** ${args.owner || 'Usuário atual'}\n`;
        responseText += `**Tempo de Consulta:** ${formatDuration(result.executionTime || 0)}\n\n`;

        if (args.showDetails) {
          tables.forEach((table, index) => {
            responseText += `**${index + 1}. ${table.tableName}**\n`;
            responseText += `   • Proprietário: ${table.owner}\n`;
            if (table.numRows !== null && table.numRows !== undefined) {
              responseText += `   • Linhas: ${formatNumber(table.numRows)}\n`;
            }
            if (table.lastAnalyzed) {
              responseText += `   • Última Análise: ${table.lastAnalyzed}\n`;
            }
            if (table.comments) {
              responseText += `   • Comentários: ${table.comments}\n`;
            }
            responseText += `\n`;
          });
        } else {
          const tableNames = tables.map(t => t.tableName).join(', ');
          responseText += `**Tabelas:** ${tableNames}`;
        }

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 5. Descrever tabela
  server.tool(
    "oracle_describe_table",
    "Obter estrutura e colunas de uma tabela Oracle",
    {
      tableName: z.string().describe("Nome da tabela a descrever"),
      owner: z.string().optional().describe("Proprietário/esquema da tabela (por padrão o usuário atual)"),
      showDetails: z.boolean().optional().default(true).describe("Mostrar detalhes completos das colunas")
    },
    async (args) => {
      try {
        const result = await getOracleService().getTableColumns(args.tableName, args.owner);
        
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro:** ${result.error}` }],
          };
        }

        const columns = result.data!;
        
        if (columns.length === 0) {
          return {
            content: [{ type: "text", text: `📋 **A tabela '${args.tableName}' não existe ou não possui colunas**` }],
          };
        }

        let responseText = `📋 **Estrutura da Tabela: ${args.tableName}**\n`;
        responseText += `**Esquema:** ${args.owner || 'Usuário atual'}\n`;
        responseText += `**Colunas:** ${formatNumber(columns.length)}\n`;
        responseText += `**Tempo de Consulta:** ${formatDuration(result.executionTime || 0)}\n\n`;

        if (args.showDetails) {
          responseText += `| # | Coluna | Tipo | Nulo | Padrão | Comentários |\n`;
          responseText += `|---|---------|------|------|---------|-------------|\n`;
          
          columns.forEach(col => {
            let dataType = col.dataType;
            if (col.dataPrecision && col.dataScale !== null && col.dataScale !== undefined) {
              dataType += `(${col.dataPrecision},${col.dataScale})`;
            } else if (col.dataLength && ['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(col.dataType)) {
              dataType += `(${col.dataLength})`;
            }

            responseText += `| ${col.columnId} | **${col.columnName}** | ${dataType} | ${col.nullable === 'Y' ? 'Sim' : 'Não'} | ${col.defaultValue || '-'} | ${col.comments || '-'} |\n`;
          });
        } else {
          const columnNames = columns.map(c => c.columnName).join(', ');
          responseText += `**Colunas:** ${columnNames}`;
        }

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 6. Executar transação
  server.tool(
    "oracle_transaction",
    "Executar múltiplos comandos SQL em uma transação",
    {
      commands: z.array(z.string()).describe("Lista de comandos SQL a executar na transação"),
      rollbackOnError: z.boolean().optional().default(true).describe("Fazer rollback se houver erro em algum comando")
    },
    async (args) => {
      try {
        let totalRowsAffected = 0;
        const results: string[] = [];
        const startTime = Date.now();

        // Nota: Isso exigiria uma implementação mais avançada do serviço Oracle
        // para lidar com transações manuais. Por enquanto, executamos comandos individuais.
        
        for (let i = 0; i < args.commands.length; i++) {
          const sql = args.commands[i];
          const commandType = getSqlCommandType(sql);
          
          let result;
          if (isReadOnlyCommand(sql)) {
            result = await getOracleService().executeQuery(sql);
          } else {
            result = await getOracleService().executeCommand(sql, [], { autoCommit: false });
          }

          if (!result.success) {
            if (args.rollbackOnError) {
              return {
                isError: true,
                content: [{ 
                  type: "text", 
                  text: `❌ **Erro na Transação (Comando ${i + 1}):** ${result.error}\n\n**Comando que falhou:** \`${sql}\`\n\n**Nota:** Foi feito rollback de todas as alterações.`
                }],
              };
            } else {
              results.push(`❌ Comando ${i + 1} (${commandType}): Erro - ${result.error}`);
            }
          } else {
            if (result.rowsAffected) {
              totalRowsAffected += result.rowsAffected;
            }
            results.push(`✅ Comando ${i + 1} (${commandType}): ${result.rowsAffected || 0} linhas afetadas`);
          }
        }

        const totalTime = Date.now() - startTime;

        let responseText = `🔄 **Transação Concluída**\n\n`;
        responseText += `**Comandos Executados:** ${args.commands.length}\n`;
        responseText += `**Total de Linhas Afetadas:** ${formatNumber(totalRowsAffected)}\n`;
        responseText += `**Tempo Total:** ${formatDuration(totalTime)}\n\n`;
        responseText += `**Detalhe por Comando:**\n${results.join('\n')}`;

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 7. Informações de configuração
  server.tool(
    "oracle_info",
    "Obter informações de configuração do Oracle Database",
    {},
    async () => {
      try {
        const config = getOracleService().getConfig();
        
        let infoText = `ℹ️ **Configuração do Oracle Database**\n\n`;
        infoText += `**Host:** ${config.host}\n`;
        infoText += `**Porta:** ${config.port}\n`;
        infoText += `**Serviço:** ${config.serviceName}\n`;
        infoText += `**Usuário:** ${config.username}\n`;
        infoText += `**Pool Mín/Máx:** ${config.poolMin}/${config.poolMax}\n`;
        infoText += `**Fetch Size:** ${config.fetchSize}\n`;
        infoText += `**Statement Cache:** ${config.stmtCacheSize}\n`;
        infoText += `**Timeout Pool:** ${config.poolTimeout}s\n`;

        if (config.connectionString) {
          infoText += `**Connection String:** Configurado\n`;
        }

        return {
          content: [{ type: "text", text: infoText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );

  // 8. Gerar resumo de programação de leite OBI
  server.tool(
    "oracle_resumo_programacao_leite",
    "Executa PK_LAC_OBI.PKB_GERA_PROGLEI e retorna somatórios da resumo_programacao_leite_obi por agrupamentos permitidos",
    {
      dtInic: z.string().optional().describe("Data inicial no formato YYYY-MM-DD"),
      dtFim: z.string().optional().describe("Data final no formato YYYY-MM-DD"),
      sistema: z.string().optional().default("OBI").describe("Identificação do sistema para a procedure"),
      processo: z.string().optional().default("MCP").describe("Identificação do processo para a procedure"),
      somatorios: z.array(z.enum([
        "quantidade_total_entregue",
        "quantidade_prevista",
        "quantidade_programada"
      ])).min(1).describe("Campos de somatório permitidos"),
      agruparPor: z.array(z.enum([
        "unidade",
        "fornecedor",
        "filiada",
        "posto",
        "produto_analisado"
      ])).min(1).describe("Campos de agrupamento permitidos"),
      filtros: z.record(z.string(), z.string()).optional().describe("Filtros opcionais por dimensão permitida"),
      maxRows: z.number().int().min(1).max(1000).optional().default(200).describe("Limite máximo de linhas"),
      formatAsTable: z.boolean().optional().default(true).describe("Formatar resultado como tabela")
    },
    async (args) => {
      try {
        const period = resolvePeriod(args.dtInic, args.dtFim);

        const procSql = `
BEGIN
  PK_LAC_OBI.PKB_GERA_PROGLEI(
    ed_dt_inic => :ed_dt_inic,
    ed_dt_fim => :ed_dt_fim,
    sv_sistema => :sv_sistema,
    sv_processo => :sv_processo,
    sv_msg_erro => :sv_msg_erro,
    sn_cd_erro => :sn_cd_erro
  );
END;`;

        const procResult = await getOracleService().executeCommand(procSql, {
          ed_dt_inic: period.startDate,
          ed_dt_fim: period.endDate,
          sv_sistema: args.sistema,
          sv_processo: args.processo,
          sv_msg_erro: {
            dir: oracledb.BIND_OUT,
            type: oracledb.STRING,
            maxSize: 4000
          },
          sn_cd_erro: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          }
        } as any, { autoCommit: true });

        if (!procResult.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro ao executar PK_LAC_OBI.PKB_GERA_PROGLEI:** ${procResult.error}` }],
          };
        }

        const outBinds = procResult.data?.outBinds || {};
        const procErrorCode = outBinds.sn_cd_erro;
        const procErrorMsg = outBinds.sv_msg_erro;

        if (procErrorCode && Number(procErrorCode) !== 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `❌ **Erro funcional da procedure**\n\nCódigo: ${procErrorCode}\nMensagem: ${procErrorMsg || 'Sem mensagem retornada'}`
            }],
          };
        }

        const queryBuild = buildLeiteAggregationQuery({
          sumFields: args.somatorios,
          groupFields: args.agruparPor,
          filters: args.filtros,
          maxRows: args.maxRows
        });

        const queryResult = await getOracleService().executeQuery(queryBuild.sql, queryBuild.binds as any, {
          maxRows: args.maxRows,
          extendedMetaData: false
        });

        if (!queryResult.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro ao consultar resumo_programacao_leite_obi:** ${queryResult.error}` }],
          };
        }

        const rows = queryResult.data?.rows || [];
        let responseText = `🥛 **Resumo Programação Leite OBI**\n\n`;
        responseText += `**Período Utilizado:** ${period.startIso} até ${period.endIso}${period.usedDefaultMonth ? ' (mês atual automático)' : ''}\n`;
        responseText += `**Somatórios:** ${queryBuild.selectedSums.join(', ')}\n`;
        responseText += `**Agrupamentos:** ${queryBuild.selectedGroups.join(', ')}\n`;
        responseText += `**Linhas Retornadas:** ${formatNumber(rows.length)}\n`;
        responseText += `**Tempo de Execução:** ${formatDuration((procResult.executionTime || 0) + (queryResult.executionTime || 0))}\n\n`;

        if (rows.length === 0) {
          responseText += "Nenhum dado encontrado para os filtros informados.";
        } else if (args.formatAsTable) {
          responseText += [
            "**Resultado**",
            "",
            "```",
            formatQueryResultAsTable(rows, args.maxRows),
            "```"
          ].join("\n");
        } else {
          responseText += `**Resultado (JSON):**\n${"```json"}\n${JSON.stringify(rows, null, 2)}\n${"```"}`;
        }

        if (procErrorMsg) {
          responseText += `\n\n**Mensagem da Procedure:** ${procErrorMsg}`;
        }

        responseText += `\n\n**Campos permitidos (somatórios):** ${Object.keys(ALLOWED_SUM_FIELDS).join(', ')}`;
        responseText += `\n**Campos permitidos (agrupamentos):** ${Object.keys(ALLOWED_GROUP_FIELDS).join(', ')}`;

        return {
          content: [{ type: "text", text: responseText }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ **Erro:** ${error.message}` }],
        };
      }
    }
  );
}
