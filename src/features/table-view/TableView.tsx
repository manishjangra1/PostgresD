import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableProperties, Key } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { databaseApi } from "../../lib/api";
import { DataGrid } from "../../components/data-grid/DataGrid";

interface TableViewProps {
  schema: string;
  table: string;
}

export function TableView({ schema, table }: TableViewProps) {
  const { activeConnectionId, openTab } = useUIStore();
  const [activeSubTab, setActiveSubTab] = useState<"data" | "structure" | "relations" | "indexes">("data");

  // 1. Fetch Row Count (for pagination/totals display)
  const { data: rowCount = 0, refetch: refetchCount } = useQuery({
    queryKey: ["rowCount", activeConnectionId, schema, table],
    queryFn: () => databaseApi.countTableRows(activeConnectionId!, schema, table),
    enabled: !!activeConnectionId,
  });

  // 2. Fetch Columns Metadata
  const { data: columns = [], isLoading: loadingCols } = useQuery({
    queryKey: ["columns", activeConnectionId, schema, table],
    queryFn: () => databaseApi.getTableColumns(activeConnectionId!, schema, table),
    enabled: !!activeConnectionId,
  });

  // 3. Fetch Indexes
  const { data: indexes = [] } = useQuery({
    queryKey: ["indexes", activeConnectionId, schema, table],
    queryFn: () => databaseApi.getTableIndexes(activeConnectionId!, schema, table),
    enabled: !!activeConnectionId && activeSubTab === "indexes",
  });

  // 4. Fetch Relations
  const { data: relations = [] } = useQuery({
    queryKey: ["relations", activeConnectionId, schema, table],
    queryFn: () => databaseApi.getTableRelations(activeConnectionId!, schema, table),
    enabled: !!activeConnectionId,
  });

  if (loadingCols) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 text-sm text-muted-foreground gap-3">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Loading table structure...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      
      {/* Header Info */}
      <div className="px-6 py-4 border-b border-border bg-card flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent/60 flex items-center justify-center text-muted-foreground border border-border">
            <TableProperties size={18} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base font-mono">{table}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono">
                {schema}
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-0.5 font-mono">
              {rowCount.toLocaleString()} rows found
            </span>
          </div>
        </div>

        {/* Workspace Subtabs */}
        <div className="flex border border-border rounded-lg bg-background p-0.5 text-xs font-semibold">
          {[
            { id: "data", title: "Browse Data" },
            { id: "structure", title: "Structure" },
            { id: "relations", title: "Relations" },
            { id: "indexes", title: "Indexes" },
          ].map((subTab) => {
            const active = activeSubTab === subTab.id;
            return (
              <button
                key={subTab.id}
                onClick={() => setActiveSubTab(subTab.id as any)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  active
                    ? "bg-accent text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {subTab.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Workspace Subtab Viewport */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === "data" && (
          <DataGrid 
            schema={schema} 
            table={table} 
            columns={columns} 
            relations={relations}
            totalRows={rowCount}
            onRowsChanged={refetchCount}
          />
        )}

        {activeSubTab === "structure" && (
          <div className="h-full overflow-auto p-6">
            <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Columns</h4>
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-accent/40 border-b border-border text-muted-foreground font-semibold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Nullable</th>
                    <th className="p-3">Default Value</th>
                    <th className="p-3 text-center">PK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {columns.map((c) => (
                    <tr key={c.name} className="hover:bg-accent/10">
                      <td className="p-3 font-semibold text-foreground">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{c.type}</td>
                      <td className="p-3">{c.nullable ? "YES" : "NO"}</td>
                      <td className="p-3 text-muted-foreground">{c.default_value || "—"}</td>
                      <td className="p-3 text-center">
                        {c.is_primary && (
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary">
                            <Key size={11} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === "relations" && (
          <div className="h-full overflow-auto p-6">
            <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Foreign Keys</h4>
            {relations.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-lg text-sm text-muted-foreground italic bg-card">
                No foreign keys defined.
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-accent/40 border-b border-border text-muted-foreground font-semibold">
                      <th className="p-3">Constraint Name</th>
                      <th className="p-3">Source Column</th>
                      <th className="p-3">Referenced Table</th>
                      <th className="p-3">Referenced Column</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {relations.map((r) => (
                      <tr key={r.constraint_name} className="hover:bg-accent/10">
                        <td className="p-3 font-semibold text-foreground">{r.constraint_name}</td>
                        <td className="p-3 text-muted-foreground">{r.column_name}</td>
                        <td 
                          className="p-3 text-primary hover:underline cursor-pointer"
                          onClick={() => {
                            const tabId = `${activeConnectionId}::${r.foreign_schema}::${r.foreign_table}`;
                            openTab({
                              id: tabId,
                              title: r.foreign_table,
                              type: "table",
                              schema: r.foreign_schema,
                              table: r.foreign_table,
                            });
                          }}
                        >
                          {r.foreign_schema}.{r.foreign_table}
                        </td>
                        <td className="p-3 text-muted-foreground">{r.foreign_column}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSubTab === "indexes" && (
          <div className="h-full overflow-auto p-6">
            <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Indexes</h4>
            {indexes.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-lg text-sm text-muted-foreground italic bg-card">
                No indexes defined.
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-accent/40 border-b border-border text-muted-foreground font-semibold">
                      <th className="p-3">Index Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Unique</th>
                      <th className="p-3">Primary</th>
                      <th className="p-3">Definition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {indexes.map((idx) => (
                      <tr key={idx.name} className="hover:bg-accent/10">
                        <td className="p-3 font-semibold text-foreground">{idx.name}</td>
                        <td className="p-3 text-muted-foreground">{idx.index_type}</td>
                        <td className="p-3">{idx.is_unique ? "YES" : "NO"}</td>
                        <td className="p-3">{idx.is_primary ? "YES" : "NO"}</td>
                        <td className="p-3 text-muted-foreground truncate max-w-[280px]" title={idx.definition}>
                          {idx.definition}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
