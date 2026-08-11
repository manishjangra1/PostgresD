import { invoke } from "@tauri-apps/api/core";
import { ConnectionInfo, ConnectionConfig, DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo, IndexInfo, RelationInfo, QueryResult, FilterOption, SortOption, PendingChange } from "../types";

const CONNECTIONS_KEY = "postgresd_connections";

export const connectionApi = {
  getConnections(): ConnectionInfo[] {
    const data = localStorage.getItem(CONNECTIONS_KEY);
    return data ? JSON.parse(data) : [];
  },

  async saveConnection(conn: ConnectionInfo, password?: string): Promise<void> {
    const list = this.getConnections();
    const idx = list.findIndex(c => c.id === conn.id);
    
    const savedConn = {
      ...conn,
      config: {
        ...conn.config,
        password: "", // Never store password in localStorage
      }
    };

    if (idx >= 0) {
      list[idx] = savedConn;
    } else {
      list.push(savedConn);
    }
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));

    if (password !== undefined && password !== "") {
      await invoke("save_password", { id: conn.id, password });
    }
  },

  async deleteConnection(id: string): Promise<void> {
    const list = this.getConnections().filter(c => c.id !== id);
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
    await invoke("delete_password", { id }).catch(() => {});
  },

  async testConnection(config: ConnectionConfig): Promise<void> {
    await invoke("test_connection", { config });
  },

  async connectDatabase(id: string, config: ConnectionConfig): Promise<void> {
    const password = await invoke<string>("get_password", { id }).catch(() => "");
    const fullConfig = { ...config, password };
    await invoke("connect_database", { id, config: fullConfig });
  },

  async disconnectDatabase(id: string): Promise<void> {
    await invoke("disconnect_database", { id }).catch(() => {});
  }
};

export const databaseApi = {
  async listDatabases(id: string): Promise<DatabaseInfo[]> {
    return invoke("list_databases", { id });
  },

  async listSchemas(id: string): Promise<SchemaInfo[]> {
    return invoke("list_schemas", { id });
  },

  async listTables(id: string, schema: string): Promise<TableInfo[]> {
    return invoke("list_tables", { id, schema });
  },

  async getTableColumns(id: string, schema: string, table: string): Promise<ColumnInfo[]> {
    return invoke("get_table_columns", { id, schema, table });
  },

  async getTableIndexes(id: string, schema: string, table: string): Promise<IndexInfo[]> {
    return invoke("get_table_indexes", { id, schema, table });
  },

  async getTableRelations(id: string, schema: string, table: string): Promise<RelationInfo[]> {
    return invoke("get_table_relations", { id, schema, table });
  },

  async fetchTableRows(
    id: string,
    schema: string,
    table: string,
    limit: number,
    offset: number,
    filters: FilterOption[],
    sort: SortOption | null
  ): Promise<QueryResult> {
    return invoke("fetch_table_rows", { id, schema, table, limit, offset, filters, sort });
  },

  async countTableRows(id: string, schema: string, table: string): Promise<number> {
    return invoke("count_table_rows", { id, schema, table });
  },

  async applyChanges(id: string, changes: PendingChange[]): Promise<void> {
    await invoke("apply_changes", { id, changes });
  },

  async executeQuery(id: string, sql: string): Promise<QueryResult> {
    return invoke("execute_query", { id, sql });
  },

  async cancelQuery(id: string): Promise<boolean> {
    return invoke("cancel_query", { id });
  },

  async exportTableToCsv(id: string, schema: string, table: string, filepath: string): Promise<void> {
    await invoke("export_table_to_csv", { id, schema, table, filepath });
  },

  async showSaveDialog(defaultName: string, filters: [string, string[]][]): Promise<string | null> {
    return invoke<string | null>("show_save_dialog", { defaultName, filters });
  },

  async writeTextFile(filepath: string, content: string): Promise<void> {
    await invoke("write_text_file", { filepath, content });
  }
};
