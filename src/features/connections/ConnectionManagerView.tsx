import React, { useState, useEffect } from "react";
import { Plus, Server, Trash2, Shield, Activity, Settings, HelpCircle, Sun, Moon } from "lucide-react";
import { connectionApi } from "../../lib/api";
import { ConnectionInfo, ConnectionConfig } from "../../types";
import { useUIStore } from "../../stores/ui";

export function parseConnectionString(url: string): Partial<ConnectionConfig> | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return null;
    }
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      user: decodeURIComponent(parsed.username) || "postgres",
      password: decodeURIComponent(parsed.password) || "",
      database: decodeURIComponent(parsed.pathname.slice(1)) || "postgres",
      ssl_mode: parsed.searchParams.get("sslmode") || "Auto",
    };
  } catch (e) {
    return null;
  }
}

export function ConnectionManagerView() {
  const { setActiveConnectionId, theme, setTheme } = useUIStore();
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | "new" | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [user, setUser] = useState("postgres");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("postgres");
  const [sslMode, setSslMode] = useState("Auto");
  const [env, setEnv] = useState<"Local" | "Development" | "Staging" | "Production">("Local");
  const [rawUrl, setRawUrl] = useState("");

  // Testing & Connecting State
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string; version?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = () => {
    const list = connectionApi.getConnections();
    setConnections(list);
    if (list.length > 0 && activeFormId === null) {
      handleSelectConnection(list[0]);
    } else if (list.length === 0) {
      setActiveFormId("new");
    }
  };

  const handleSelectConnection = async (conn: ConnectionInfo) => {
    setActiveFormId(conn.id);
    setName(conn.name);
    setHost(conn.config.host);
    setPort(conn.config.port);
    setUser(conn.config.user);
    setDatabase(conn.config.database);
    setSslMode(conn.config.ssl_mode || "Auto");
    setEnv(conn.environment || "Local");
    setRawUrl("");
    setTestResult(null);

    // Load password from secure storage if we are editing
    setConnecting(true);
    try {
      const pw = await connectionApi.connectDatabase(conn.id, conn.config).then(() => "").catch(() => "");
      setPassword(pw);
    } catch (_) {}
    setConnecting(false);
  };

  const handleNewConnection = () => {
    setActiveFormId("new");
    setName("Local Development");
    setHost("localhost");
    setPort(5432);
    setUser("postgres");
    setPassword("password");
    setDatabase("postgres");
    setSslMode("Auto");
    setEnv("Local");
    setRawUrl("");
    setTestResult(null);
  };

  const handleRawUrlChange = (val: string) => {
    setRawUrl(val);
    if (!val) return;
    const parsed = parseConnectionString(val);
    if (parsed) {
      if (parsed.host) setHost(parsed.host);
      if (parsed.port) setPort(parsed.port);
      if (parsed.user) setUser(parsed.user);
      if (parsed.password !== undefined) setPassword(parsed.password);
      if (parsed.database) setDatabase(parsed.database);
      if (parsed.ssl_mode) setSslMode(parsed.ssl_mode);
      setTestResult(null);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const config: ConnectionConfig = { host, port, user, password, database, ssl_mode: sslMode };
      await connectionApi.testConnection(config);
      setTestResult({
        success: true,
        msg: "Connection successful!",
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: e?.message || "Failed to establish a database connection.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    setConnecting(true);
    setTestResult(null);
    try {
      const config: ConnectionConfig = { host, port, user, password, database, ssl_mode: sslMode };
      const connId = activeFormId === "new" ? crypto.randomUUID() : (activeFormId as string);
      
      const newConn: ConnectionInfo = {
        id: connId,
        name: name || `${host}:${port}`,
        config,
        environment: env,
        createdAt: new Date().toISOString(),
      };

      // 1. Save connection & password
      await connectionApi.saveConnection(newConn, password);
      
      // 2. Connect to the connection pool
      await connectionApi.connectDatabase(connId, config);

      // 3. Mark active in UI
      setActiveConnectionId(connId);
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: e?.message || "Could not save or connect to the database.",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this connection?")) return;
    await connectionApi.deleteConnection(id);
    if (activeFormId === id) {
      handleNewConnection();
    }
    loadConnections();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      
      {/* Sidebar: Connections List */}
      <div className="w-[300px] flex-shrink-0 border-r border-border bg-card flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="p-6 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" className="h-8 w-8 object-contain" alt="PostgresD Logo" />
              <span className="font-semibold text-lg tracking-tight">PostgresD</span>
            </div>
            <button 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          {/* List Wrapper */}
          <div className="p-4 flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
            <div className="flex justify-between items-center px-2 py-1 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connections</span>
              <button 
                onClick={handleNewConnection}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="New connection"
              >
                <Plus size={16} />
              </button>
            </div>

            {connections.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                No connections configured yet.
              </div>
            ) : (
              connections.map((c) => {
                const isActive = activeFormId === c.id;
                const envColor = 
                  c.environment === "Production" ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
                  c.environment === "Staging" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                  "bg-muted text-muted-foreground";

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConnection(c)}
                    className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                      isActive 
                        ? "bg-accent border-accent text-foreground shadow-sm" 
                        : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Server size={16} className={isActive ? "text-primary" : "text-muted-foreground"} />
                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="font-medium text-sm truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{c.config.host}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${envColor}`}>
                        {c.environment.substring(0, 4).toUpperCase()}
                      </span>
                      <button
                        onClick={(e) => handleDelete(c.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive-foreground transition-all"
                        title="Delete connection"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-accent/20">
          <span>v1.0.0 Stable</span>
          <div className="flex gap-2">
            <HelpCircle size={14} className="cursor-pointer hover:text-foreground" />
            <Settings size={14} className="cursor-pointer hover:text-foreground" />
          </div>
        </div>
      </div>

      {/* Form Area */}
      <div className="flex-1 bg-background flex flex-col justify-center items-center overflow-hidden p-6">
        <div className="w-full max-w-[540px] flex flex-col gap-4">
          <div className="border-b border-border pb-3">
            <h2 className="text-xl font-bold tracking-tight">
              {activeFormId === "new" ? "New PostgreSQL Connection" : "Edit Connection"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Connect to your database securely using local credentials or standard Connection URL.
            </p>
          </div>

          {/* Connection URL Paste */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Connection URL (Optional)</label>
            <input
              type="text"
              placeholder="postgresql://user:password@host:5432/database?sslmode=require"
              value={rawUrl}
              onChange={(e) => handleRawUrlChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {/* Connection Name */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground">Connection Name</label>
              <input
                type="text"
                placeholder="Local Development"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all"
              />
            </div>

            {/* Host */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Host</label>
              <input
                type="text"
                placeholder="localhost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
              />
            </div>

            {/* Port */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Port</label>
              <input
                type="number"
                placeholder="5432"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 5432)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
              />
            </div>

            {/* Database */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Database</label>
              <input
                type="text"
                placeholder="postgres"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
              />
            </div>

            {/* Environment */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Environment</label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all h-[30px] cursor-pointer"
              >
                <option value="Local">Local</option>
                <option value="Development">Development</option>
                <option value="Staging">Staging</option>
                <option value="Production">Production</option>
              </select>
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Username</label>
              <input
                type="text"
                placeholder="postgres"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all font-mono"
              />
            </div>

            {/* SSL Mode */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground">SSL Mode</label>
              <select
                value={sslMode}
                onChange={(e) => setSslMode(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border focus:border-ring outline-none text-xs transition-all h-[30px] cursor-pointer"
              >
                <option value="Auto">Auto (Default)</option>
                <option value="Disable">Disable (No SSL)</option>
                <option value="Prefer">Prefer</option>
                <option value="Require">Require</option>
              </select>
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div 
              className={`p-2.5 rounded-lg border text-xs flex gap-2.5 ${
                testResult.success 
                  ? "bg-green-500/10 border-green-500/20 text-green-400" 
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
            >
              {testResult.success ? <Activity size={15} /> : <Shield size={15} />}
              <div className="flex flex-col text-[11px] leading-relaxed max-h-[80px] overflow-y-auto">
                <span className="font-semibold">{testResult.msg}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2 border-t border-border">
            <button
              onClick={handleTest}
              disabled={testing || connecting}
              className="px-4 py-1.5 border border-border text-xs font-semibold rounded-lg hover:bg-accent hover:text-foreground transition-all disabled:opacity-50"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            <button
              onClick={handleSaveAndConnect}
              disabled={testing || connecting}
              className="px-5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
