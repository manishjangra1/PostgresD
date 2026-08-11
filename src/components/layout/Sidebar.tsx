import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, ChevronDown, ChevronRight, RefreshCw, LogOut, Layers, Database, Sun, Moon } from "lucide-react";
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
    theme,
    setTheme,
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
    <div className="h-full flex flex-col select-none">
      
      {/* Top: Database Explorer Header (Aligned with Workspace Tab bar height 36px) */}
      <div className="h-9 border-b border-border flex items-center px-3 bg-accent/5 shrink-0 select-none">
        <div className="flex-1 flex items-center gap-2">
          <Database size={13} className="text-muted-foreground" />
          {loadingDbs || dbSwitching ? (
            <div className="flex-1 text-xs text-muted-foreground animate-pulse">
              Switching...
            </div>
          ) : (
            <select
              value={selectedDatabase || ""}
              onChange={(e) => handleDatabaseChange(e.target.value)}
              className="flex-1 bg-transparent outline-none text-xs font-semibold font-mono h-6 cursor-pointer border-none p-0 focus:ring-0"
            >
              {databases.map((db) => (
                <option key={db.name} value={db.name} className="bg-background text-foreground">
                  {db.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Explorer Header Box (Aligned with TableView Header bar height 68px) */}
      <div className="h-[68px] px-4 border-b border-border bg-accent/2 flex items-center justify-between shrink-0 select-none">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Schemas & Tables</span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          title="Refresh database structure"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Explorer list: flex-1 takes all available space, min-h-0 enables scrolling */}
      <div className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto min-h-0">
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
                  className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold rounded hover:bg-accent/40 text-left text-muted-foreground hover:text-foreground cursor-pointer"
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

      {/* Footer: Connection Info & Theme switcher (Aligned with Table Pagination footer height 48px) */}
      <div className="h-[48px] border-t border-border bg-card flex items-center justify-between px-3 text-xs select-none shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isProd ? "bg-red-500" : "bg-green-500"}`} />
          <span className="font-semibold truncate max-w-[150px]" title={activeConn?.name}>
            {activeConn?.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button 
            onClick={handleDisconnect}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
            title="Disconnect Connection"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>

    </div>
  );
}
