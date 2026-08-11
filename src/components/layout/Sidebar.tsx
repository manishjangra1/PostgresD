import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, ChevronDown, ChevronRight, RefreshCw, LogOut, Terminal, Layers } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { databaseApi, connectionApi } from "../../lib/api";
import { Tab, TableInfo } from "../../types";

export function Sidebar() {
  const queryClient = useQueryClient();
  const {
    activeConnectionId,
    selectedDatabase,
    selectedSchema,
    setSelectedDatabase,
    setSelectedSchema,
    setActiveConnectionId,
    openTab,
  } = useUIStore();

  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({ public: true });
  const [dbSwitching, setDbSwitching] = useState(false);

  // Get active connection details
  const connections = connectionApi.getConnections();
  const activeConn = connections.find((c) => c.id === activeConnectionId);

  // 1. Fetch Databases
  const { data: databases = [], isLoading: loadingDbs } = useQuery({
    queryKey: ["databases", activeConnectionId],
    queryFn: () => databaseApi.listDatabases(activeConnectionId!),
    enabled: !!activeConnectionId,
  });

  // 2. Fetch Schemas
  const { data: schemas = [], isLoading: loadingSchemas } = useQuery({
    queryKey: ["schemas", activeConnectionId, selectedDatabase],
    queryFn: () => databaseApi.listSchemas(activeConnectionId!),
    enabled: !!activeConnectionId && !!selectedDatabase,
  });

  // Set default database once loaded
  React.useEffect(() => {
    if (activeConn && !selectedDatabase && databases.length > 0) {
      // Find if configured database matches one in the list
      const match = databases.find((d) => d.name === activeConn.config.database);
      setSelectedDatabase(match ? match.name : databases[0].name);
    }
  }, [databases, activeConn, selectedDatabase]);

  // Set default schema once loaded
  React.useEffect(() => {
    if (schemas.length > 0 && !selectedSchema) {
      const match = schemas.find((s) => s.name === "public");
      setSelectedSchema(match ? match.name : schemas[0].name);
    }
  }, [schemas, selectedSchema]);

  const handleDatabaseChange = async (dbName: string) => {
    if (!activeConn || dbSwitching) return;
    setDbSwitching(true);
    try {
      // Switch database connection pool on backend
      const newConfig = { ...activeConn.config, database: dbName };
      await connectionApi.connectDatabase(activeConn.id, newConfig);
      
      // Update UI state
      setSelectedDatabase(dbName);
      setSelectedSchema(null);

      // Invalidate queries so schemas & tables reload
      await queryClient.invalidateQueries({ queryKey: ["schemas"] });
      await queryClient.invalidateQueries({ queryKey: ["tables"] });
    } catch (e) {
      alert("Failed to switch database: " + (e as any).message);
    } finally {
      setDbSwitching(false);
    }
  };

  const handleDisconnect = async () => {
    if (activeConnectionId) {
      await connectionApi.disconnectDatabase(activeConnectionId);
      setActiveConnectionId(null);
    }
  };

  const handleOpenTable = (schema: string, table: TableInfo) => {
    const tabId = `${activeConnectionId}::${schema}::${table.name}`;
    const newTab: Tab = {
      id: tabId,
      title: table.name,
      type: "table",
      schema,
      table: table.name,
    };
    openTab(newTab);
  };

  const handleOpenSqlEditor = () => {
    const tabId = `${activeConnectionId}::sql-editor::${crypto.randomUUID().substring(0, 8)}`;
    const newTab: Tab = {
      id: tabId,
      title: "Query Editor",
      type: "query",
    };
    openTab(newTab);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries();
  };

  const toggleSchema = (schemaName: string) => {
    setExpandedSchemas((prev) => ({
      ...prev,
      [schemaName]: !prev[schemaName],
    }));
  };

  // Render Table List inside Schema Node
  function SchemaTablesList({ schemaName }: { schemaName: string }) {
    const { data: tables = [], isLoading: loadingTables } = useQuery({
      queryKey: ["tables", activeConnectionId, selectedDatabase, schemaName],
      queryFn: () => databaseApi.listTables(activeConnectionId!, schemaName),
      enabled: !!activeConnectionId && !!selectedDatabase && expandedSchemas[schemaName],
    });

    if (loadingTables) {
      return (
        <div className="pl-9 py-1 text-xs text-muted-foreground animate-pulse">
          Loading tables...
        </div>
      );
    }

    if (tables.length === 0) {
      return (
        <div className="pl-9 py-1 text-xs text-muted-foreground italic">
          No tables or views.
        </div>
      );
    }

    return (
      <div className="flex flex-col pl-6">
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => handleOpenTable(schemaName, t)}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground text-left truncate transition-colors"
          >
            <Folder size={12} className="text-muted-foreground/60 flex-shrink-0" />
            <span className="truncate font-mono">{t.name}</span>
            {t.is_view && (
              <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground scale-90">
                VIEW
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  const isProd = activeConn?.environment === "Production";

  return (
    <div className="h-full flex flex-col justify-between select-none">
      
      {/* Top: Active Connection Details */}
      <div>
        <div className="p-4 border-b border-border bg-accent/20 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Connected to</span>
            <button 
              onClick={handleDisconnect}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
              title="Disconnect"
            >
              <LogOut size={13} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isProd ? "bg-red-500" : "bg-green-500"}`} />
            <span className="font-semibold text-sm truncate">{activeConn?.name}</span>
          </div>
          
          {/* Database Selector Dropdown */}
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Database</label>
            {loadingDbs || dbSwitching ? (
              <div className="h-[28px] bg-accent/30 rounded flex items-center px-2 text-xs text-muted-foreground animate-pulse">
                Switching database...
              </div>
            ) : (
              <select
                value={selectedDatabase || ""}
                onChange={(e) => handleDatabaseChange(e.target.value)}
                className="px-2 py-1 rounded bg-background border border-border outline-none text-xs font-mono h-[28px] focus:border-primary/50 cursor-pointer"
              >
                {databases.map((db) => (
                  <option key={db.name} value={db.name}>
                    {db.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Action: SQL Editor */}
        <div className="p-3 border-b border-border flex gap-2">
          <button
            onClick={handleOpenSqlEditor}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded text-xs hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Terminal size={13} />
            <span>New SQL Editor</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh database structure"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Explorer progressive list */}
        <div className="p-2 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-230px)]">
          <span className="text-[10px] font-bold text-muted-foreground uppercase px-2 mb-1">Schemas & Tables</span>
          
          {loadingSchemas ? (
            <div className="px-2 py-4 text-xs text-muted-foreground animate-pulse">
              Loading schemas...
            </div>
          ) : schemas.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground italic">
              No schemas found.
            </div>
          ) : (
            schemas.map((s) => {
              const isExpanded = !!expandedSchemas[s.name];
              return (
                <div key={s.name} className="flex flex-col">
                  {/* Schema Node */}
                  <button
                    onClick={() => toggleSchema(s.name)}
                    className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold rounded hover:bg-accent/40 text-left text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Layers size={13} className="text-muted-foreground/60" />
                      <span className="truncate font-mono">{s.name}</span>
                    </div>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>

                  {/* Progressive/Lazy Child Table Render */}
                  {isExpanded && <SchemaTablesList schemaName={s.name} />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer environment label */}
      <div className="p-3 border-t border-border flex justify-center bg-accent/10">
        <span className={`text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded border uppercase ${
          isProd ? "bg-red-500/20 border-red-500/30 text-red-400" :
          activeConn?.environment === "Staging" ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
          "bg-muted border-border text-muted-foreground"
        }`}>
          {activeConn?.environment} Env
        </span>
      </div>

    </div>
  );
}
