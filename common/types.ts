// Configuração de conexão ao Oracle DB
export interface OracleConnectionConfig {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  connectionString?: string;
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  poolTimeout?: number;
  stmtCacheSize?: number;
  fetchSize?: number;
}

// Resultado de operação com Oracle DB
export interface OracleResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  command?: string;
  executionTime?: number;
  rowsAffected?: number;
  metadata?: OracleMetadata;
}

// Metadados do resultado
export interface OracleMetadata {
  columns?: OracleColumnInfo[];
  statement?: string;
  bindDefs?: any[];
  outFormat?: number;
}

// Informações da coluna
export interface OracleColumnInfo {
  name: string;
  fetchType: number;
  dbType: number;
  dbTypeName: string;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  maxSize?: number;
}

// Resultado da consulta
export interface QueryResult {
  rows: any[];
  metadata: OracleColumnInfo[];
  rowsAffected?: number;
}

// Resultado da execução
export interface ExecuteResult {
  rowsAffected: number;
  lastRowid?: string;
  outBinds?: any;
}

// Informações da tabela
export interface TableInfo {
  tableName: string;
  tableType: string;
  owner: string;
  comments?: string;
  numRows?: number;
  lastAnalyzed?: Date;
}

// Informações da coluna da tabela
export interface TableColumnInfo {
  columnName: string;
  dataType: string;
  dataLength?: number;
  dataPrecision?: number;
  dataScale?: number;
  nullable: string;
  defaultValue?: string;
  comments?: string;
  columnId: number;
}

// Informações do índice
export interface IndexInfo {
  indexName: string;
  tableName: string;
  owner: string;
  indexType: string;
  uniqueness: string;
  columns: IndexColumnInfo[];
}

// Informações da coluna do índice
export interface IndexColumnInfo {
  columnName: string;
  columnPosition: number;
  descend: string;
}

// Informações da visão (view)
export interface ViewInfo {
  viewName: string;
  owner: string;
  text: string;
  textLength: number;
  readOnly: string;
}

// Informações de procedimento/função
export interface ProcedureInfo {
  objectName: string;
  procedureName: string;
  owner: string;
  objectType: string;
  status: string;
  created: Date;
  lastDdlTime: Date;
}

// Informações da sequência
export interface SequenceInfo {
  sequenceName: string;
  owner: string;
  minValue: number;
  maxValue: number;
  incrementBy: number;
  cycleFlag: string;
  orderFlag: string;
  cacheSize: number;
  lastNumber: number;
}

// Status da conexão
export interface ConnectionStatus {
  connected: boolean;
  poolStatus?: {
    connectionsOpen: number;
    connectionsInUse: number;
    poolAlias: string;
    poolMin: number;
    poolMax: number;
    poolIncrement: number;
    poolTimeout: number;
    queueMax: number;
    queueTimeout: number;
    stmtCacheSize: number;
  };
  version?: string;
  sessionInfo?: {
    sessionId: number;
    username: string;
    schemaName: string;
    program: string;
    machine: string;
    osUser: string;
    process: string;
    module: string;
    action: string;
    clientInfo: string;
    logonTime: Date;
  };
}

// Opções para consultas
export interface QueryOptions {
  maxRows?: number;
  fetchArraySize?: number;
  outFormat?: number; // oracledb.OUT_FORMAT_OBJECT ou oracledb.OUT_FORMAT_ARRAY
  autoCommit?: boolean;
  bindDefs?: any;
  extendedMetaData?: boolean;
  resultSet?: boolean;
}

// Opções para execução
export interface ExecuteOptions {
  autoCommit?: boolean;
  bindDefs?: any;
  outFormat?: number;
  extendedMetaData?: boolean;
  batchErrors?: boolean;
  dmlRowCounts?: boolean;
}

// Parâmetros de bind
export interface BindParameter {
  val?: any;
  type?: number;
  maxSize?: number;
  dir?: number; // oracledb.BIND_IN, oracledb.BIND_OUT, oracledb.BIND_INOUT
}

// Informações do esquema
export interface SchemaInfo {
  schemaName: string;
  defaultTablespace: string;
  temporaryTablespace: string;
  created: Date;
  accountStatus: string;
  lockDate?: Date;
  expiryDate?: Date;
  profile: string;
}

// Informações do tablespace
export interface TablespaceInfo {
  tablespaceName: string;
  blockSize: number;
  initialExtent: number;
  nextExtent: number;
  minExtents: number;
  maxExtents: number;
  pctIncrease: number;
  status: string;
  contents: string;
  logging: string;
  forceLogging: string;
  extentManagement: string;
  allocationType: string;
  segmentSpaceManagement: string;
}