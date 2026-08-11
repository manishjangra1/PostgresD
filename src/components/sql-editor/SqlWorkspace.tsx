import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Play, Square, Trash2, Clock, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { databaseApi } from "../../lib/api";
import { QueryResult } from "../../types";

export function SqlWorkspace() {
  const { activeConnectionId, theme } = useUIStore();
  const [sql, setSql] = useState<string>("SELECT * FROM large_dataset LIMIT 10;");
  const [executing, setExecuting] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<{ message: string; technical?: string } | null>(null);
  
  // Local Query History State
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    // Load local query history
    const stored = localStorage.getItem(`postgresd_history_${activeConnectionId}`);
    if (stored) {
      setHistory(JSON.parse(stored));
    }
  }, [activeConnectionId]);

  const addQueryToHistory = (queryStr: string) => {
    const trimmed = queryStr.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...history.filter(q => q !== trimmed)].slice(0, 30); // limit to 30 items
    setHistory(updated);
    localStorage.setItem(`postgresd_history_${activeConnectionId}`, JSON.stringify(updated));
  };

  const handleRun = async () => {
    if (!sql.trim() || executing) return;
    setExecuting(true);
    setResult(null);
    setError(null);
    setExecTime(null);

    const startTime = performance.now();
    try {
      addQueryToHistory(sql);
      const res = await databaseApi.executeQuery(activeConnectionId!, sql);
      setResult(res);
      setExecTime(Math.round(performance.now() - startTime));
    } catch (e: any) {
      setError({
        message: e?.message || "SQL Execution failed.",
        technical: e?.technical || JSON.stringify(e),
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleCancel = async () => {
    if (!executing) return;
    try {
      const canceled = await databaseApi.cancelQuery(activeConnectionId!);
      if (canceled) {
        setError({
          message: "Query execution canceled by user.",
        });
      }
    } catch (e: any) {
      alert("Failed to cancel query: " + (e.message || JSON.stringify(e)));
    } finally {
      setExecuting(false);
    }
  };

  const handleFormat = () => {
    // Simple basic regex formatter for illustration
    let formatted = sql
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*(\bSELECT\b|\bFROM\b|\bWHERE\b|\bJOIN\b|\bORDER BY\b|\bLIMIT\b|\bGROUP BY\b)\s*/gi, "\n$1 ")
      .trim();
    setSql(formatted);
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem(`postgresd_history_${activeConnectionId}`);
  };

  const monacoTheme = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "vs-dark" : "light";

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      
      {/* 1. Toolbar */}
      <div className="p-3 border-b border-border bg-card flex justify-between items-center select-none">
        <div className="flex items-center gap-2">
          {executing ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold rounded-lg text-xs hover:bg-red-500/20 active:scale-[0.98] transition-all"
            >
              <Square size={13} fill="currentColor" />
              <span>Stop Execution</span>
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Play size={13} fill="currentColor" />
              <span>Execute SQL</span>
            </button>
          )}

          <button
            onClick={handleFormat}
            disabled={executing}
            className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-accent text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
          >
            Format SQL
          </button>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-accent transition-colors ${
            showHistory ? "border-primary/50 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <History size={13} />
          <span>History ({history.length})</span>
        </button>
      </div>

      {/* 2. Workspace Body (Editor + History + Results) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* SQL Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-[200px] border-b border-border">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme={monacoTheme}
              value={sql}
              onChange={(val) => setSql(val || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
                lineNumbers: "on",
                automaticLayout: true,
                wordWrap: "on",
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Results Area */}
          <div className="h-[250px] flex flex-col bg-card overflow-hidden">
            {/* Results Title Bar */}
            <div className="px-4 py-2 border-b border-border bg-accent/20 flex justify-between items-center text-xs text-muted-foreground select-none">
              <span className="font-semibold uppercase tracking-wider">Results</span>
              {(result || execTime || error) && (
                <div className="flex items-center gap-3">
                  {execTime && (
                    <span className="flex items-center gap-1 font-mono">
                      <Clock size={11} /> {execTime}ms
                    </span>
                  )}
                  {result && (
                    <span className="font-mono">
                      {result.rows.length} rows, {result.affected_rows} affected
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Content viewport */}
            <div className="flex-1 overflow-auto relative">
              {executing && (
                <div className="absolute inset-0 bg-background/50 flex flex-col justify-center items-center gap-3 select-none">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Running SQL statement...</span>
                </div>
              )}

              {error && (
                <div className="p-4 flex flex-col gap-2 bg-red-500/5 text-red-400">
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <AlertTriangle size={15} />
                    <span>{error.message}</span>
                  </div>
                  {error.technical && (
                    <pre className="p-3 bg-red-500/10 border border-red-500/20 rounded font-mono text-[10px] whitespace-pre-wrap select-text max-h-[150px] overflow-auto leading-relaxed">
                      {error.technical}
                    </pre>
                  )}
                </div>
              )}

              {result && result.rows.length > 0 && (
                <div className="w-full text-xs font-mono">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-accent/40 border-b border-border sticky top-0 z-10 select-none">
                        {result.columns.map((col) => (
                          <th key={col} className="p-2 border-r border-border font-semibold text-foreground bg-card">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-border/60 hover:bg-accent/20">
                          {result.columns.map((col) => {
                            const val = row[col];
                            return (
                              <td key={col} className="p-2 border-r border-border truncate max-w-[200px] select-text">
                                {val === null ? (
                                  <span className="text-red-500/50 font-bold uppercase text-[10px]">null</span>
                                ) : typeof val === "object" ? (
                                  JSON.stringify(val)
                                ) : (
                                  val.toString()
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result && result.rows.length === 0 && !error && (
                <div className="h-full w-full flex flex-col justify-center items-center gap-2 p-6 text-muted-foreground select-none">
                  <CheckCircle2 size={24} className="text-green-500/60" />
                  <span className="text-xs font-semibold">Query executed successfully! No rows returned.</span>
                  <span className="text-[10px] font-mono">Affected rows: {result.affected_rows}</span>
                </div>
              )}

              {!result && !error && !executing && (
                <div className="h-full w-full flex justify-center items-center text-muted-foreground text-xs italic select-none">
                  No results to display. Press "Execute SQL" to run your query.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History Pane */}
        {showHistory && (
          <div className="w-[260px] border-l border-border bg-card flex flex-col justify-between select-none flex-shrink-0">
            <div>
              <div className="p-3 border-b border-border flex justify-between items-center text-xs text-muted-foreground font-bold uppercase">
                <span>Query History</span>
                <Trash2 size={13} className="cursor-pointer hover:text-red-400" onClick={handleClearHistory} />
              </div>
              <div className="p-2 flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground italic">
                    No history recorded.
                  </div>
                ) : (
                  history.map((q, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSql(q);
                        setShowHistory(false);
                      }}
                      className="p-2.5 rounded border border-border/40 hover:border-primary/40 bg-background/50 hover:bg-background cursor-pointer transition-all"
                    >
                      <pre className="font-mono text-[10px] text-muted-foreground truncate leading-normal">
                        {q}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="p-3 border-t border-border bg-accent/20 text-[10px] text-muted-foreground text-center">
              Click query block to load in editor
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
