export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl_mode?: string;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  config: ConnectionConfig;
  environment: 'Local' | 'Development' | 'Staging' | 'Production';
  createdAt: string;
}

export interface DatabaseInfo {
  name: string;
}

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  name: string;
  is_view: boolean;
}

export interface ForeignKeyInfo {
  schema: string;
  table: string;
  column: string;
  target_column: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary: boolean;
  foreign_key?: ForeignKeyInfo;
}

export interface IndexInfo {
  name: string;
  index_type: string;
  is_unique: boolean;
  is_primary: boolean;
  definition: string;
}

export interface RelationInfo {
  constraint_name: string;
  column_name: string;
  foreign_schema: string;
  foreign_table: string;
  foreign_column: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  affected_rows: number;
  execution_time_ms: number;
}

export interface FilterOption {
  column: string;
  operator: string;
  value: any;
}

export interface SortOption {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface PendingChange {
  type: 'update' | 'delete' | 'insert';
  table_schema: string;
  table_name: string;
  primary_key_column?: string;
  primary_key_value?: any;
  column_values?: Record<string, any>;
}

export type TabType = 'table' | 'query' | 'diagnostics' | 'welcome';

export interface Tab {
  id: string; // ConnectionID + TabType + Unique Target (e.g. Table Name)
  title: string;
  type: TabType;
  schema?: string;
  table?: string;
}
