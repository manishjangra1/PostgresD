import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { 
  Search, Filter, RefreshCw, Plus, Trash2, Save, X, 
  ChevronLeft, ChevronRight, AlertCircle, PlusCircle, ArrowUpDown, Download,
  Terminal, Copy
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { databaseApi } from "../../lib/api";
import { ColumnInfo, FilterOption, SortOption, PendingChange, RelationInfo } from "../../types";

interface DataGridProps {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  relations: RelationInfo[];
  totalRows: number;
  onRowsChanged: () => void;
}

export function DataGrid({ schema, table, columns, relations, totalRows, onRowsChanged }: DataGridProps) {
  const { activeConnectionId, openTab } = useUIStore();

  // Foreign Key Reference details overlay state
  interface FkRecordDetails {
    schema: string;
    table: string;
    column: string;
    value: any;
  }
  const [activeFkDetails, setActiveFkDetails] = useState<FkRecordDetails | null>(null);

  // Row selection state
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    rowIndex: number;
    colName: string;
    value: any;
  } | null>(null);

  const handleOpenSqlEditor = () => {
    const tabId = `${activeConnectionId}::sql-editor::${crypto.randomUUID().substring(0, 8)}`;
    const newTab = {
      id: tabId,
      title: "Query Editor",
      type: "query" as const,
    };
    openTab(newTab);
  };

  const handleCopyRow = async (row: any) => {
    try {
      const cleanRow: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        if (!key.endsWith(" []")) {
          cleanRow[key] = row[key];
        }
      });
      await navigator.clipboard.writeText(JSON.stringify(cleanRow, null, 2));
      alert("Successfully copied row as JSON to clipboard!");
    } catch (err: any) {
      alert("Failed to copy: " + err.message);
    }
  };

  const convertToCsv = (headers: string[], rows: any[]): string => {
    const csvRows = [];
    csvRows.push(headers.join(","));
    for (const row of rows) {
      const values = headers.map(header => {
        const val = row[header];
        const valStr = val === null ? "" : typeof val === "object" ? JSON.stringify(val) : val.toString();
        const escaped = valStr.replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(","));
    }
    return csvRows.join("\n");
  };


  // Pagination State
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sorting & Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortOption | null>(null);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [activeFilterCol, setActiveFilterCol] = useState(columns[0]?.name || "");
  const [activeFilterOp, setActiveFilterOp] = useState("equals");
  const [activeFilterVal, setActiveFilterVal] = useState("");

  // CRUD Editing State
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colName: string; originalVal: any } | null>(null);
  const [editValue, setEditValue] = useState("");
  
  // New Row Modal state
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  
  // Header height measuring state for correct virtualization offset
  const [headerHeight, setHeaderHeight] = useState(37);
  const headerRef = useRef<HTMLTableRowElement>(null);

  // Column Widths State (for stretchable/resizable columns)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    // Reset columns visibility on load
    const initialVisibility: Record<string, boolean> = {};
    columns.forEach((c) => {
      initialVisibility[c.name] = true;
    });
    setVisibleColumns(initialVisibility);
  }, [columns]);

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight || 37);
    }
  }, [columns, visibleColumns]);

  useEffect(() => {
    setSelectedRowIndices(new Set());
  }, [currentPage, pageSize, table]);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to page 1 on search
    }, 250);

    return () => clearTimeout(handler);
  }, [searchQuery]);



  // Dynamic filter compilation
  const compiledFilters = React.useMemo(() => {
    const list = [...filters];
    if (debouncedSearch) {
      // Find a suitable column for simple search (prefer text/varchar/email, or fallback to first column)
      const textCol = columns.find(c => c.type.includes("char") || c.type.includes("text") || c.name === "name" || c.name === "email");
      const targetCol = textCol ? textCol.name : (columns[0]?.name || "");
      if (targetCol) {
        list.push({
          column: targetCol,
          operator: "contains",
          value: debouncedSearch,
        });
      }
    }
    return list;
  }, [filters, debouncedSearch, columns]);

  // 1. Fetch Rows Data Slice
  const offset = (currentPage - 1) * pageSize;
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rows", activeConnectionId, schema, table, pageSize, currentPage, sort, compiledFilters],
    queryFn: () => databaseApi.fetchTableRows(
      activeConnectionId!,
      schema,
      table,
      pageSize,
      offset,
      compiledFilters,
      sort
    ),
    enabled: !!activeConnectionId,
  });

  // Query to fetch details of a clicked foreign key referenced record
  const { data: fkRecordData, isLoading: loadingFkRecord } = useQuery({
    queryKey: ["fk-record", activeConnectionId, activeFkDetails],
    queryFn: () => databaseApi.fetchTableRows(
      activeConnectionId!,
      activeFkDetails!.schema,
      activeFkDetails!.table,
      50, // Limit to 50 child records if it is a list, or 1 if it is a single reference
      0,
      [{ column: activeFkDetails!.column, operator: "equals", value: activeFkDetails!.value.toString() }],
      null
    ),
    enabled: !!activeConnectionId && !!activeFkDetails,
  });

  const { data: fkColumns = [] } = useQuery({
    queryKey: ["fk-columns", activeConnectionId, activeFkDetails?.schema, activeFkDetails?.table],
    queryFn: () => databaseApi.getTableColumns(activeConnectionId!, activeFkDetails!.schema, activeFkDetails!.table),
    enabled: !!activeConnectionId && !!activeFkDetails,
  });

  const rows = data?.rows || [];

  // Filter columns to show only visible ones
  const activeColumns = columns.filter((c) => visibleColumns[c.name] !== false);

  // Parent container ref for virtualizer scrolling
  const parentRef = useRef<HTMLDivElement>(null);

  // virtualized rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // typical cell row height
    overscan: 15,
    paddingStart: headerHeight,
  });

  // CRUD Mutations
  const saveMutation = useMutation({
    mutationFn: () => databaseApi.applyChanges(activeConnectionId!, pendingChanges),
    onSuccess: () => {
      setPendingChanges([]);
      onRowsChanged();
      refetch();
    },
    onError: (err: any) => {
      alert(`Save changes failed:\n${err.message || err.technical || "Unknown error"}`);
    }
  });

  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    const handleCloseMenus = () => {
      if (showExportMenu) setShowExportMenu(false);
      if (contextMenu?.visible) setContextMenu(null);
    };
    document.addEventListener("click", handleCloseMenus);
    return () => document.removeEventListener("click", handleCloseMenus);
  }, [showExportMenu, contextMenu]);

  const handleExportData = async (scope: "selected" | "all", format: "json" | "excel") => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      let dataToExport: any[] = [];
      if (scope === "selected") {
        dataToExport = rows.filter((_, idx) => selectedRowIndices.has(idx));
      } else {
        const res = await databaseApi.fetchTableRows(
          activeConnectionId!,
          schema,
          table,
          10000,
          0,
          compiledFilters,
          sort
        );
        dataToExport = res.rows;
      }

      const exportRows = dataToExport.map(row => {
        const clean: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          if (!key.endsWith(" []")) {
            clean[key] = row[key];
          }
        });
        return clean;
      });

      if (exportRows.length === 0) {
        alert("No data available to export.");
        return;
      }

      const extension = format === "json" ? "json" : "csv";
      const filterName = format === "json" ? "JSON File" : "CSV File";
      const defaultName = `${table}_export.${extension}`;

      const path = await databaseApi.showSaveDialog(defaultName, [[filterName, [extension]]]);
      if (!path) return;

      let content = "";
      if (format === "json") {
        content = JSON.stringify(exportRows, null, 2);
      } else {
        const headers = columns.filter(c => !c.type.endsWith("[]")).map(c => c.name);
        const csv = convertToCsv(headers, exportRows);
        content = "\uFEFF" + csv;
      }

      await databaseApi.writeTextFile(path, content);
      alert(`Successfully exported data to:\n${path}`);
    } catch (e: any) {
      alert("Export failed: " + (e.message || JSON.stringify(e)));
    } finally {
      setExporting(false);
    }
  };

  const handleCellDoubleClick = (rowIndex: number, colName: string, val: any) => {
    const col = columns.find((c) => c.name === colName);
    if (col?.type.endsWith("[]")) return; // virtual relations are read-only
    setEditingCell({ rowIndex, colName, originalVal: val });
    setEditValue(val === null ? "" : typeof val === "object" ? JSON.stringify(val) : val.toString());
  };

  const handleSaveCellEdit = () => {
    if (!editingCell) return;
    const { rowIndex, colName, originalVal } = editingCell;
    const row = rows[rowIndex];

    // Find PK column of the table
    const pkColumn = columns.find((c) => c.is_primary)?.name || columns[0]?.name;
    const pkValue = row[pkColumn];

    const currentVal = editValue;
    if (currentVal !== originalVal?.toString()) {
      // Accumulate pending changes
      const updatedColVals: Record<string, any> = {};
      updatedColVals[colName] = currentVal === "" ? null : currentVal;

      const change: PendingChange = {
        type: "update",
        table_schema: schema,
        table_name: table,
        primary_key_column: pkColumn,
        primary_key_value: pkValue,
        column_values: updatedColVals,
      };

      setPendingChanges((prev) => [...prev, change]);
    }
    setEditingCell(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveCellEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const handleDeleteRow = (rowIndex: number) => {
    const row = rows[rowIndex];
    const pkColumn = columns.find((c) => c.is_primary)?.name || columns[0]?.name;
    const pkValue = row[pkColumn];

    if (!confirm("Are you sure you want to mark this row for deletion?")) return;

    const change: PendingChange = {
      type: "delete",
      table_schema: schema,
      table_name: table,
      primary_key_column: pkColumn,
      primary_key_value: pkValue,
    };

    setPendingChanges((prev) => [...prev, change]);
  };

  const handleAddFilter = () => {
    if (!activeFilterCol) return;
    setFilters((prev) => [
      ...prev,
      { column: activeFilterCol, operator: activeFilterOp, value: activeFilterVal },
    ]);
    setActiveFilterVal("");
    setShowFilterBuilder(false);
  };

  const handleRemoveFilter = (idx: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleSort = (colName: string) => {
    if (sort?.column === colName) {
      if (sort.direction === "ASC") {
        setSort({ column: colName, direction: "DESC" });
      } else {
        setSort(null);
      }
    } else {
      setSort({ column: colName, direction: "ASC" });
    }
  };

  const handleInsertRow = async () => {
    const colVals: Record<string, any> = {};
    columns.forEach(c => {
      const val = newRowData[c.name];
      if (val !== undefined && val !== "") {
        colVals[c.name] = val;
      }
    });

    const change: PendingChange = {
      type: "insert",
      table_schema: schema,
      table_name: table,
      column_values: colVals,
    };

    setPendingChanges(prev => [...prev, change]);
    setShowAddRowModal(false);
    setNewRowData({});
  };

  const handleResizeStart = (e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = columnWidths[columnName] || 150;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX); // min width 60px
      setColumnWidths((prev) => ({
        ...prev,
        [columnName]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const totalWidth = React.useMemo(() => {
    return 80 + activeColumns.reduce((sum, col) => sum + (columnWidths[col.name] || 150), 0);
  }, [activeColumns, columnWidths]);

  const totalPages = Math.ceil(totalRows / pageSize) || 1;

  function renderCellValue(val: any, col: ColumnInfo, isModalContext = false, row?: Record<string, any>) {
    if (!isModalContext) {
      const fkRelation = relations?.find((r) => r.column_name === col.name);
      if (fkRelation && val !== null && val !== undefined) {
        return (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              setActiveFkDetails({
                schema: fkRelation.foreign_schema,
                table: fkRelation.foreign_table,
                column: fkRelation.foreign_column,
                value: val,
              });
            }}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer font-mono text-xs font-semibold select-none border border-primary/20"
          >
            <span className="opacity-70 text-[10px] uppercase font-sans tracking-wide">FK</span>
            <span>{val.toString()}</span>
          </span>
        );
      }
    }

    if (col.type.endsWith("[]")) {
      const modelName = col.type.slice(0, -2);
      const count = typeof val === "number" ? val : parseInt(val, 10) || 0;
      const isClickable = count > 0 && col.foreign_key && row;

      return (
        <span 
          onClick={(e) => {
            if (!isClickable) return;
            e.stopPropagation();
            setActiveFkDetails({
              schema: col.foreign_key!.schema,
              table: col.foreign_key!.table,
              column: col.foreign_key!.column,
              value: row[col.foreign_key!.target_column],
            });
          }}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-all ${
            isClickable 
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 cursor-pointer" 
              : "bg-muted text-muted-foreground border-border"
          } select-none`}
        >
          <span className={`${isClickable ? "bg-blue-400 text-slate-950" : "bg-muted-foreground/20 text-muted-foreground"} font-bold px-1 rounded-sm scale-90 -ml-1`}>
            {count}
          </span>
          <span>{modelName}</span>
        </span>
      );
    }
    if (val === null) {
      return (
        <span className="text-red-500/50 bg-red-500/5 px-1.5 py-0.5 rounded font-mono text-[10px] select-none font-bold uppercase">
          null
        </span>
      );
    }
    if (typeof val === "boolean") {
      return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${val ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {val ? "TRUE" : "FALSE"}
        </span>
      );
    }
    if (typeof val === "object") {
      return (
        <span className="font-mono text-xs text-amber-500 truncate" title={JSON.stringify(val)}>
          {JSON.stringify(val)}
        </span>
      );
    }
    return <span className="font-mono text-xs truncate select-text">{val.toString()}</span>;
  }

  return (
    <div className="h-full w-full flex flex-col justify-between overflow-hidden bg-background">
      
      {/* 1. Grid Actions Toolbar */}
      <div className="p-3 border-b border-border bg-card flex flex-wrap justify-between items-center gap-3 select-none">
        
        {/* Left Side: Search & Filter Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Search */}
          <div className="relative w-[220px]">
            <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search active column..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-lg bg-background border border-border focus:border-ring outline-none text-xs w-full transition-all"
            />
          </div>

          {/* Filter Popover Button */}
          <div className="relative">
            <button
              onClick={() => setShowFilterBuilder(!showFilterBuilder)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-accent transition-colors ${
                filters.length > 0 ? "border-primary/50 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              <Filter size={13} />
              <span>Filters ({filters.length})</span>
            </button>

            {/* Visual Filters Popover Builder */}
            {showFilterBuilder && (
              <div className="absolute top-8 left-0 w-[300px] border border-border bg-card shadow-2xl rounded-xl p-4 z-50 flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Build Filter</span>
                  <X size={14} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setShowFilterBuilder(false)} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-muted-foreground">Column</label>
                  <select
                    value={activeFilterCol}
                    onChange={(e) => setActiveFilterCol(e.target.value)}
                    className="px-2 py-1 rounded bg-background border border-border outline-none text-xs"
                  >
                    {columns.filter((c) => !c.type.endsWith("[]")).map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-muted-foreground">Operator</label>
                  <select
                    value={activeFilterOp}
                    onChange={(e) => setActiveFilterOp(e.target.value)}
                    className="px-2 py-1 rounded bg-background border border-border outline-none text-xs"
                  >
                    <option value="equals">equals</option>
                    <option value="not equals">not equals</option>
                    <option value="greater than">greater than</option>
                    <option value="less than">less than</option>
                    <option value="contains">contains</option>
                    <option value="starts with">starts with</option>
                    <option value="ends with">ends with</option>
                    <option value="is null">is null</option>
                    <option value="is not null">is not null</option>
                  </select>
                </div>
                {activeFilterOp !== "is null" && activeFilterOp !== "is not null" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-muted-foreground">Value</label>
                    <input
                      type="text"
                      placeholder="Filter value..."
                      value={activeFilterVal}
                      onChange={(e) => setActiveFilterVal(e.target.value)}
                      className="px-3 py-1 bg-background border border-border rounded text-xs outline-none focus:border-ring"
                    />
                  </div>
                )}
                <button
                  onClick={handleAddFilter}
                  className="w-full py-1.5 bg-primary text-primary-foreground font-semibold rounded text-xs hover:opacity-95 transition-all"
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>

          {/* New SQL Editor Button */}
          <button
            onClick={handleOpenSqlEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:opacity-90 active:scale-[0.98] transition-all"
            title="Open a new SQL Query Editor tab"
          >
            <Terminal size={13} />
            <span>New SQL Editor</span>
          </button>

          {/* Active Filter Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-accent border border-border text-[10px] font-mono text-muted-foreground hover:text-foreground"
              >
                <span>{f.column} {f.operator} {f.value !== undefined ? `"${f.value}"` : ""}</span>
                <X size={10} className="cursor-pointer text-muted-foreground hover:text-red-400" onClick={() => handleRemoveFilter(i)} />
              </span>
            ))}
          </div>

        </div>

        {/* Right Side: Grid Utilities & CRUD Operations */}
        <div className="flex items-center gap-2">
          {/* Add Row Button */}
          <button
            onClick={() => setShowAddRowModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs font-semibold hover:bg-primary/25 transition-colors"
          >
            <Plus size={13} />
            <span>Add Row</span>
          </button>

          {/* Export Dropdown Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowExportMenu(!showExportMenu);
              }}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-accent text-muted-foreground hover:text-foreground transition-all disabled:opacity-50 cursor-pointer"
              title="Export data options"
            >
              <Download size={13} />
              <span>{exporting ? "Exporting..." : "Export"}</span>
            </button>

            {showExportMenu && (
              <div 
                className="absolute right-0 top-8 w-[200px] border border-border bg-card shadow-2xl rounded-lg py-1 z-50 text-xs flex flex-col font-sans text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase border-b border-border">Export Selected ({selectedRowIndices.size})</div>
                <button
                  onClick={() => handleExportData("selected", "json")}
                  disabled={selectedRowIndices.size === 0}
                  className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors cursor-pointer disabled:opacity-50"
                >
                  Selected as JSON (.json)
                </button>
                <button
                  onClick={() => handleExportData("selected", "excel")}
                  disabled={selectedRowIndices.size === 0}
                  className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors cursor-pointer disabled:opacity-50"
                >
                  Selected as Excel / CSV (.csv)
                </button>

                <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase border-t border-b border-border mt-1">Export Entire Table</div>
                <button
                  onClick={() => handleExportData("all", "json")}
                  className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors cursor-pointer font-sans"
                >
                  Entire Table as JSON (.json)
                </button>
                <button
                  onClick={() => handleExportData("all", "excel")}
                  className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors cursor-pointer font-sans"
                >
                  Entire Table as Excel / CSV (.csv)
                </button>
              </div>
            )}
          </div>

          {/* Refresh Grid */}
          <button
            onClick={() => refetch()}
            className="p-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh Grid Data"
          >
            <RefreshCw size={13} />
          </button>
        </div>

      </div>

      {/* 2. Grid Table Viewport */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="absolute inset-0 bg-background/50 flex flex-col justify-center items-center gap-3">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground">Loading page rows...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-full w-full flex flex-col justify-center items-center text-muted-foreground text-xs italic">
            No rows found.
          </div>
        ) : (
          <div ref={parentRef} className="h-full w-full overflow-auto scrollbar-thin">
            {/* Scrollable Container */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: `${totalWidth}px`,
                position: "relative",
              }}
            >
              {/* Virtualized Rows List */}
              <table 
                className="text-left text-xs border-collapse absolute top-0 left-0"
                style={{ width: `${totalWidth}px` }}
              >
                <thead>
                  <tr 
                    ref={headerRef}
                    className="bg-accent/40 sticky top-0 border-b border-border z-10 select-none flex items-stretch w-full"
                  >
                    <th 
                      className="p-2 border-r border-border text-center bg-card shrink-0 flex items-center justify-center gap-1.5"
                      style={{ width: "80px", minWidth: "80px", maxWidth: "80px" }}
                    >
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedRowIndices.size === rows.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRowIndices(new Set(rows.map((_, i) => i)));
                          } else {
                            setSelectedRowIndices(new Set());
                          }
                        }}
                        className="rounded border-border scale-95 cursor-pointer accent-primary"
                        title="Select/Deselect all rows"
                      />
                    </th>
                    {activeColumns.map((c) => (
                      <th
                        key={c.name}
                        className="relative p-2 border-r border-border hover:bg-accent cursor-pointer group bg-card shrink-0 flex items-center justify-between font-mono"
                        style={{
                          width: `${columnWidths[c.name] || 150}px`,
                          minWidth: `${columnWidths[c.name] || 150}px`,
                          maxWidth: `${columnWidths[c.name] || 150}px`,
                        }}
                      >
                        <div 
                          onClick={() => handleToggleSort(c.name)} 
                          className="flex-1 flex items-center justify-between gap-2 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-foreground truncate">{c.name}</span>
                            {c.is_primary && <span className="text-[9px] text-amber-500 shrink-0">PK</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground/60">{c.type}</span>
                            <ArrowUpDown size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                          </div>
                        </div>

                        {/* Resizer Handle */}
                        <div
                          onMouseDown={(e) => handleResizeStart(e, c.name)}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary z-20 transition-colors"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowVirtualizer.getVirtualItems().map((vRow) => {
                    const row = rows[vRow.index];
                    const isEven = vRow.index % 2 === 0;

                    return (
                      <tr
                        key={vRow.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${vRow.size}px`,
                          transform: `translateY(${vRow.start}px)`,
                        }}
                        className={`flex items-stretch border-b border-border/60 hover:bg-accent/30 ${
                          isEven ? "bg-background" : "bg-accent/10"
                        }`}
                      >
                        {/* Select, Copy, Delete column */}
                        <td 
                          className="p-2 border-r border-border flex items-center justify-center shrink-0 h-full bg-card/10 gap-1.5"
                          style={{ width: "80px", minWidth: "80px", maxWidth: "80px" }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRowIndices.has(vRow.index)}
                            onChange={(e) => {
                              const next = new Set(selectedRowIndices);
                              if (e.target.checked) {
                                next.add(vRow.index);
                              } else {
                                next.delete(vRow.index);
                              }
                              setSelectedRowIndices(next);
                            }}
                            className="rounded border-border scale-95 cursor-pointer accent-primary"
                            title="Select row for export"
                          />
                          <button
                            onClick={() => handleCopyRow(row)}
                            className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                            title="Copy row as JSON"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(vRow.index)}
                            className="p-0.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Delete row"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>

                        {/* Data columns */}
                        {activeColumns.map((col) => {
                          const val = row[col.name];
                          const isEditing = 
                            editingCell?.rowIndex === vRow.index && 
                            editingCell?.colName === col.name;
                          const width = columnWidths[col.name] || 150;

                          return (
                            <td
                              key={col.name}
                              onDoubleClick={() => handleCellDoubleClick(vRow.index, col.name, val)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({
                                  visible: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  rowIndex: vRow.index,
                                  colName: col.name,
                                  value: val,
                                });
                              }}
                              className="p-2 border-r border-border shrink-0 truncate h-full flex items-center"
                              style={{
                                width: `${width}px`,
                                minWidth: `${width}px`,
                                maxWidth: `${width}px`,
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={handleSaveCellEdit}
                                  onKeyDown={handleKeyPress}
                                  autoFocus
                                  className="w-full px-1.5 py-0.5 rounded bg-background border border-primary text-xs outline-none font-mono"
                                />
                              ) : (
                                renderCellValue(val, col, false, row)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Toolbar (Pagination, pending changes) */}
      <div className="p-3 border-t border-border bg-card flex flex-col md:flex-row justify-between items-center gap-3 select-none">
        
        {/* Unsaved Changes Banner */}
        {pendingChanges.length > 0 ? (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-amber-400 text-xs">
            <AlertCircle size={14} />
            <span className="font-semibold">{pendingChanges.length} unsaved changes pending</span>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-black font-bold rounded hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Save size={12} />
              <span>{saveMutation.isPending ? "Saving..." : "Save changes"}</span>
            </button>
            <button
              onClick={() => setPendingChanges([])}
              className="p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-all"
              title="Discard changes"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground font-mono">
            Showing {offset + 1}–{Math.min(offset + pageSize, totalRows)} of {totalRows.toLocaleString()} rows
          </div>
        )}

        {/* Pagination navigation controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setCurrentPage(1);
              }}
              className="px-1.5 py-0.5 rounded bg-background border border-border outline-none text-xs font-mono"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 border border-border rounded bg-background text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-mono">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 border border-border rounded bg-background text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* 4. Add Row Modal Dialog */}
      {showAddRowModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-[500px] rounded-xl shadow-2xl p-6 flex flex-col gap-5 select-none">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle size={16} className="text-primary" />
                <span className="font-bold text-sm">Add Row to {table}</span>
              </div>
              <X size={16} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setShowAddRowModal(false)} />
            </div>

            <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
              {columns.map((c) => {
                const isDefault = c.default_value !== null;
                const isSerial = c.type.includes("serial");

                return (
                  <div key={c.name} className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="font-semibold text-muted-foreground">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{c.type} {c.nullable ? "" : "NOT NULL"}</span>
                    </div>
                    <input
                      type="text"
                      placeholder={isSerial ? "DEFAULT (Auto-increment)" : isDefault ? `DEFAULT (${c.default_value})` : "Enter value..."}
                      disabled={isSerial}
                      value={newRowData[c.name] || ""}
                      onChange={(e) => setNewRowData(prev => ({ ...prev, [c.name]: e.target.value }))}
                      className="px-3 py-1.5 bg-background border border-border rounded outline-none focus:border-ring font-mono text-xs"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2.5 justify-end border-t border-border pt-3">
              <button
                onClick={() => setShowAddRowModal(false)}
                className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleInsertRow}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Add Row
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Reference Details Modal */}
      {activeFkDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[680px] bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-accent/10">
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Reference Viewer</span>
                <span className="text-xs font-semibold font-mono text-foreground mt-0.5">
                  {activeFkDetails.schema}.{activeFkDetails.table} where {activeFkDetails.column} = "{activeFkDetails.value}"
                </span>
              </div>
              <button 
                onClick={() => setActiveFkDetails(null)}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-5">
              {loadingFkRecord ? (
                <div className="flex flex-col gap-3 py-12 items-center justify-center">
                  <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-xs text-muted-foreground animate-pulse">Loading referenced data...</span>
                </div>
              ) : !fkRecordData || fkRecordData.rows.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground italic">
                  No matching reference record found.
                </div>
              ) : fkRecordData.rows.length === 1 ? (
                /* Single record: vertical key-value detail list */
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border bg-card">
                  {(() => {
                    const row = fkRecordData.rows[0];
                    return fkColumns.map((col) => {
                      const val = row[col.name];
                      return (
                        <div key={col.name} className="flex items-start text-xs p-3 hover:bg-accent/10 text-left">
                          <div className="w-[180px] font-mono font-medium text-muted-foreground shrink-0 select-none truncate">
                            {col.name}
                            <span className="text-[9px] text-muted-foreground/40 block font-sans mt-0.5">
                              {col.type}
                            </span>
                          </div>
                          <div className="flex-1 font-mono break-all pl-4 border-l border-border select-text">
                            {renderCellValue(val, col, true)}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                /* Multiple records: scrollable horizontal table */
                <div className="flex flex-col gap-3 text-left">
                  <div className="text-[11px] text-muted-foreground font-semibold px-1">
                    Found {fkRecordData.rows.length} matching rows in {activeFkDetails.table}
                  </div>
                  <div className="border border-border rounded-lg overflow-x-auto max-h-[50vh] bg-card">
                    <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-accent/40 border-b border-border text-muted-foreground font-semibold font-mono">
                          {fkColumns.map((col) => (
                            <th key={col.name} className="p-2.5 whitespace-nowrap">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {fkRecordData.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-accent/10">
                            {fkColumns.map((col) => {
                              const val = row[col.name];
                              return (
                                <td key={col.name} className="p-2.5 max-w-[250px] truncate select-text">
                                  {renderCellValue(val, col, true)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex justify-end bg-accent/10">
              <button
                onClick={() => setActiveFkDetails(null)}
                className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:opacity-90 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Right-Click Context Menu */}
      {contextMenu?.visible && (
        <div 
          className="fixed border border-border bg-card shadow-2xl rounded-lg py-1.5 z-50 text-xs flex flex-col min-w-[170px] font-sans text-left"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[9px] font-bold text-muted-foreground uppercase border-b border-border/60 mb-1 select-none">
            Cell Actions ({contextMenu.colName})
          </div>
          <button
            onClick={async () => {
              const val = contextMenu.value;
              const textVal = val === null ? "NULL" : typeof val === "object" ? JSON.stringify(val) : val.toString();
              await navigator.clipboard.writeText(textVal);
              setContextMenu(null);
            }}
            className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors flex items-center gap-2 cursor-pointer font-sans"
          >
            <Copy size={11} className="text-muted-foreground" />
            <span>Copy Cell Value</span>
          </button>
          <button
            onClick={async () => {
              const row = rows[contextMenu.rowIndex];
              await handleCopyRow(row);
              setContextMenu(null);
            }}
            className="px-3 py-1.5 hover:bg-accent hover:text-foreground text-left transition-colors flex items-center gap-2 cursor-pointer font-sans"
          >
            <Copy size={11} className="text-muted-foreground" />
            <span>Copy Entire Row (JSON)</span>
          </button>
        </div>
      )}

    </div>
  );
}
