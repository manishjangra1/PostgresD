import { useState, useEffect } from "react";
import { useUIStore } from "../../stores/ui";
import { Sidebar } from "./Sidebar";
import { Workspace } from "./Workspace";
import { ConnectionManagerView } from "../../features/connections/ConnectionManagerView";

export function Shell() {
  const { activeConnectionId } = useUIStore();
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Clamp sidebar width between 180px and 450px
      const newWidth = Math.max(180, Math.min(450, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!activeConnectionId) {
    return <ConnectionManagerView />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none font-sans">
      <div 
        style={{ width: `${sidebarWidth}px` }} 
        className="flex-shrink-0 h-full overflow-hidden border-r border-border bg-card"
      >
        <Sidebar />
      </div>
      
      {/* Resizable Divider Handle */}
      <div
        className="w-[3px] h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/50 transition-colors flex-shrink-0 z-50"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      />

      <div className="flex-1 h-full overflow-hidden bg-background">
        <Workspace />
      </div>
    </div>
  );
}
