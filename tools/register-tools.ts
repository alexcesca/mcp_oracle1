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
import {
  ALLOWED_SUM_FIELDS_SOBRA,
  ALLOWED_GROUP_FIELDS_SOBRA,
  aggregateSobraAvesRows
} from "../common/sobra-aves-aggregation.js";

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
            content: [{ type: "text", text: `⚠️ **Aviso:** Esta ferramenta permite apenas consultas SELECT.` }],
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

  // 3. Informações de configuração
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

  // 4. Gerar resumo de programação de leite OBI
  server.tool(
    "oracle_resumo_programacao_leite",
    "Executa PK_LAC_OBI.PKB_GERA_PROGLEI e retorna somatórios da programacao leite por agrupamentos permitidos",
    {
      dtInic: z.string().optional().describe("Data inicial no formato YYYY-MM-DD"),
      dtFim: z.string().optional().describe("Data final no formato YYYY-MM-DD"),
      sistema: z.string().optional().default("OBI").describe("Identificação do sistema para a procedure"),
      processo: z.string().optional().default("MCP").describe("Identificação do processo para a procedure"),
      somatorios: z.array(z.enum([
        "quantidade_total_entregue",
        "quantidade_prevista",
        "quantidade_programada"
      ])).min(1).describe("Campos de somatório permitidos: quantidade_total_entregue=TOT_REAL_DEST, quantidade_prevista=QTDE_PREV_DEST, quantidade_programada=QTDE_PROG"),
      agruparPor: z.array(z.enum([
        "unidade",
        "fornecedor",
        "filiada",
        "posto",
        "produto_analisado"
      ])).min(1).describe("Campos de agrupamento permitidos: unidade=CD_UNID_ORIG, fornecedor=FORN_ID_ORIG, filiada=CD_FILI_ORIG, posto=CD_POSTO_ORIG, produto_analisado=DESCR_MATERANALI"),
      filtros: z.record(z.string(), z.string()).optional().describe("Filtros opcionais por dimensão permitida"),
      maxRows: z.number().int().min(1).max(1000).optional().default(200).describe("Limite máximo de linhas"),
      formatAsTable: z.boolean().optional().default(true).describe("Formatar resultado como tabela")
    },
    async (args) => {
      try {
        const period = resolvePeriod(args.dtInic, args.dtFim);

        const deleteSql = ` DELETE FROM resumo_programacao_leite_obi`;
        const deleteResult = await getOracleService().executeCommand(deleteSql, {} as any, { autoCommit: true });

        if (!deleteResult.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro ao limpar dados do período:** ${deleteResult.error}` }],
          };
        }

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
          sv_sistema: {
            dir: oracledb.BIND_OUT,
            type: oracledb.STRING,
            maxSize: 10
          },
          sv_processo: {
            dir: oracledb.BIND_OUT,
            type: oracledb.STRING,
            maxSize: 50
          },
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
          maxRows: args.maxRows,
          startDate: period.startDate,
          endDate: period.endDate
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
            formatQueryResultAsTable(rows),//args.maxRows),
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

  // 5. Resumo de sobra de ração por lote de aves (CAP/OBI)
  server.tool(
    "oracle_resumo_sobra_racao_aves",
    "Executa PK_CAP_OBI.PKB_SOBRA_AVC e retorna somatórios de sobra de ração por lote de aves com agrupamentos flexíveis",
    {
      dtInic: z.string().optional().describe("Data inicial no formato YYYY-MM-DD"),
      dtFim: z.string().optional().describe("Data final no formato YYYY-MM-DD"),
      somatorios: z.array(z.enum([
        "qtde_entregue",
        "qtde_sobra",
        "qtde_sobra_p_ave"
      ])).min(1).describe(
        "Campos de somatório: " +
        "qtde_entregue=quantidade de aves entregue, " +
        "qtde_sobra=quantidade de ração que sobrou no lote do produtor, " +
        "qtde_sobra_p_ave=quantidade de ração que sobrou por ave entregue"
      ),
      agruparPor: z.array(z.enum([
        "associado",
        "filiada",
        "item",
        "assistente_tecnico",
        "unidade_abate",
        "sexo_aves",
        "tipo_nao_conformidade",
        "tipo_sobra",
        "data_fechamento"
      ])).min(1).describe(
        "Campos de agrupamento: " +
        "associado=cd_fili-cd_asso-cd_prop-cd_aviario-cd_lotcamaves-nome_asso (concatenado), " +
        "filiada=cd_fili+nome_fili, " +
        "item=cd_item+descr_item, " +
        "assistente_tecnico=cd_assis+nome_assis, " +
        "unidade_abate=cd_unid_abate+abrev_unid_abate, " +
        "sexo_aves=cd_avessexotv+descr_avessexotv, " +
        "tipo_nao_conformidade=cd_tpnconfagr+descr_tpnconfagr, " +
        "tipo_sobra=0(SOBROU no lote)/1(TRANSFERENCIA), " +
        "data_fechamento=DT_FECH"
      ),
      maxRows: z.number().int().min(1).max(5000).optional().default(200).describe("Limite máximo de linhas no resultado agregado"),
      formatAsTable: z.boolean().optional().default(true).describe("Formatar resultado como tabela")
    },
    async (args) => {
      try {
        const period = resolvePeriod(args.dtInic, args.dtFim);

        const procSql = `
DECLARE
  est_dadoslote pk_cap_obi.t_tab_rec_ddslotavc;
  sv_sistema    VARCHAR2(5);
  sv_processo   VARCHAR2(50);
  sv_msg_erro   VARCHAR2(500);
  sn_cd_erro    NUMBER(5);
BEGIN
  pk_cap_obi.pkb_sobra_avc(
    ed_dt_ini     => :ed_dt_ini,
    ed_dt_fim     => :ed_dt_fim,
    est_dadoslote => est_dadoslote,
    sv_sistema    => sv_sistema,
    sv_processo   => sv_processo,
    sv_msg_erro   => sv_msg_erro,
    sn_cd_erro    => sn_cd_erro
  );
  :sv_sistema  := sv_sistema;
  :sv_processo := sv_processo;
  :sv_msg_erro := sv_msg_erro;
  :sn_cd_erro  := sn_cd_erro;
  OPEN :cur FOR SELECT * FROM TABLE(est_dadoslote);
END;`;

        const procResult = await getOracleService().executeProcWithCursor(
          procSql,
          {
            ed_dt_ini:   period.startDate,
            ed_dt_fim:   period.endDate,
            sv_sistema:  { dir: oracledb.BIND_OUT, type: oracledb.STRING,  maxSize: 10 },
            sv_processo: { dir: oracledb.BIND_OUT, type: oracledb.STRING,  maxSize: 50 },
            sv_msg_erro: { dir: oracledb.BIND_OUT, type: oracledb.STRING,  maxSize: 500 },
            sn_cd_erro:  { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
            cur:         { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
          },
          args.maxRows * 50   // busca generosa de linhas brutas antes da agregação
        );

        if (!procResult.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `❌ **Erro ao executar PK_CAP_OBI.PKB_SOBRA_AVC:** ${procResult.error}` }],
          };
        }

        const outBinds = procResult.data?.outBinds || {};
        const procErrorCode = outBinds.sn_cd_erro;
        const procErrorMsg  = outBinds.sv_msg_erro;

        if (procErrorCode && Number(procErrorCode) !== 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `❌ **Erro funcional da procedure**\n\nCódigo: ${procErrorCode}\nProcesso: ${outBinds.sv_processo || ''}\nMensagem: ${procErrorMsg || 'Sem mensagem retornada'}`
            }],
          };
        }

        const rawRows = procResult.data?.rows || [];

        const aggregation = aggregateSobraAvesRows({
          rawRows,
          sumFields: args.somatorios,
          groupFields: args.agruparPor,
          maxRows: args.maxRows
        });

        let responseText = `🐔 **Resumo Sobra de Ração por Lote de Aves (CAP/OBI)**\n\n`;
        responseText += `**Período Utilizado:** ${period.startIso} até ${period.endIso}${period.usedDefaultMonth ? ' (mês atual automático)' : ''}\n`;
        responseText += `**Somatórios:** ${aggregation.selectedSums.join(', ')}\n`;
        responseText += `**Agrupamentos:** ${aggregation.selectedGroups.join(', ')}\n`;
        responseText += `**Registros brutos (collection):** ${formatNumber(aggregation.totalRawRows)}\n`;
        responseText += `**Linhas Retornadas:** ${formatNumber(aggregation.rows.length)}\n`;
        responseText += `**Tempo de Execução:** ${formatDuration(procResult.executionTime || 0)}\n\n`;

        if (aggregation.rows.length === 0) {
          responseText += "Nenhum dado encontrado para os filtros informados.";
        } else if (args.formatAsTable) {
          responseText += [
            "**Resultado**",
            "",
            "```",
            formatQueryResultAsTable(aggregation.rows),
            "```"
          ].join("\n");
        } else {
          responseText += `**Resultado (JSON):**\n${"```json"}\n${JSON.stringify(aggregation.rows, null, 2)}\n${"```"}`;
        }

        if (procErrorMsg) {
          responseText += `\n\n**Mensagem da Procedure:** ${procErrorMsg}`;
        }

        responseText += `\n\n**Campos permitidos (somatórios):** ${Object.keys(ALLOWED_SUM_FIELDS_SOBRA).join(', ')}`;
        responseText += `\n**Campos permitidos (agrupamentos):** ${Object.keys(ALLOWED_GROUP_FIELDS_SOBRA).join(', ')}`;

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
