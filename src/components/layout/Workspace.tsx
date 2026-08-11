import { useState, useEffect, useRef } from "react";
import { X, Database, Terminal, FileSpreadsheet, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { TableView } from "../../features/table-view/TableView";
import { SqlWorkspace } from "../sql-editor/SqlWorkspace";

export function Workspace() {
  const { openTabs, activeTabId, closeTab, setActiveTabId, openTab, activeConnectionId } = useUIStore();

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (tabContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  const scrollTabs = (direction: "left" | "right") => {
    if (tabContainerRef.current) {
      const scrollAmount = 200;
      tabContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    checkScroll();
    const timer = setTimeout(checkScroll, 100);
    return () => clearTimeout(timer);
  }, [openTabs, activeTabId]);

  useEffect(() => {
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, []);

  const handleOpenSqlEditor = () => {
    const tabId = `${activeConnectionId}::sql-editor::${crypto.randomUUID().substring(0, 8)}`;
    const newTab = {
      id: tabId,
      title: "Query Editor",
      type: "query" as const,
    };
    openTab(newTab);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      
      {/* 1. Tab Bar */}
      {openTabs.length > 0 && (
        <div className="flex h-9 border-b border-border bg-card select-none items-center relative shrink-0">
          {/* Left Scroll Arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scrollTabs("left")}
              className="h-full px-2 flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground border-r border-border transition-all cursor-pointer shrink-0 z-10 bg-card"
            >
              <ChevronLeft size={13} />
            </button>
          )}

          {/* Scrollable Tabs */}
          <div 
            ref={tabContainerRef}
            onScroll={checkScroll}
            className="flex-1 flex h-full overflow-x-auto items-center scrollbar-none"
          >
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const Icon = tab.type === "query" ? Terminal : FileSpreadsheet;

              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex items-center h-full px-4 border-r border-border gap-2 text-xs cursor-pointer transition-all shrink-0 ${
                    isActive
                      ? "bg-background text-foreground font-semibold border-b-[2px] border-b-primary"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <Icon size={12} className={isActive ? "text-primary" : "text-muted-foreground/60"} />
                  <span className="truncate max-w-[120px] font-mono">{tab.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right Scroll Arrow */}
          {canScrollRight && (
            <button
              onClick={() => scrollTabs("right")}
              className="h-full px-2 flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground border-l border-border transition-all cursor-pointer shrink-0 z-10 bg-card"
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* 2. Workspace Viewport */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab ? (
          activeTab.type === "table" ? (
            <TableView
              key={activeTab.id}
              schema={activeTab.schema!}
              table={activeTab.table!}
            />
          ) : (
            <SqlWorkspace key={activeTab.id} />
          )
        ) : (
          /* Empty/Welcome State */
          <div className="h-full w-full flex flex-col justify-center items-center p-8 text-center bg-background">
            <div className="max-w-[420px] flex flex-col items-center gap-6">
              <div className="h-12 w-12 rounded-2xl bg-accent/40 flex items-center justify-center text-muted-foreground border border-border">
                <Database size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">No open workspaces</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Select a table or view from the Database Explorer on the left, or open a clean SQL editor to start querying.
                </p>
              </div>
              <button
                onClick={handleOpenSqlEditor}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-sm hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <Plus size={14} />
                <span>Open SQL Editor</span>
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
