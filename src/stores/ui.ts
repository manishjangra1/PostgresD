import { create } from "zustand";
import { Tab } from "../types";

interface UIState {
  activeConnectionId: string | null;
  selectedDatabase: string | null;
  selectedSchema: string | null;
  selectedTable: string | null;
  sidebarCollapsed: boolean;
  openTabs: Tab[];
  activeTabId: string | null;
  theme: "system" | "light" | "dark";

  setActiveConnectionId: (id: string | null) => void;
  setSelectedDatabase: (db: string | null) => void;
  setSelectedSchema: (schema: string | null) => void;
  setSelectedTable: (table: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string | null) => void;
  setTheme: (theme: "system" | "light" | "dark") => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  activeConnectionId: null,
  selectedDatabase: null,
  selectedSchema: null,
  selectedTable: null,
  sidebarCollapsed: false,
  openTabs: [],
  activeTabId: null,
  theme: (localStorage.getItem("postgresd_theme") as "system" | "light" | "dark") || "system",

  setActiveConnectionId: (id) => {
    if (id === null) {
      set({
        activeConnectionId: null,
        selectedDatabase: null,
        selectedSchema: null,
        selectedTable: null,
        openTabs: [],
        activeTabId: null,
      });
    } else {
      set({ activeConnectionId: id });
    }
  },

  setSelectedDatabase: (db) => set({ selectedDatabase: db, selectedSchema: null, selectedTable: null }),
  setSelectedSchema: (schema) => set({ selectedSchema: schema, selectedTable: null }),
  setSelectedTable: (table) => set({ selectedTable: table }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openTab: (tab) => {
    const { openTabs } = get();
    const exists = openTabs.some((t) => t.id === tab.id);
    if (!exists) {
      set({ openTabs: [...openTabs, tab], activeTabId: tab.id });
    } else {
      set({ activeTabId: tab.id });
    }
  },

  closeTab: (id) => {
    const { openTabs, activeTabId } = get();
    const filteredTabs = openTabs.filter((t) => t.id !== id);
    let nextActiveId = activeTabId;

    if (activeTabId === id) {
      // If we closed the active tab, find a neighbor
      const closedIdx = openTabs.findIndex((t) => t.id === id);
      if (filteredTabs.length > 0) {
        const nextIdx = Math.max(0, closedIdx - 1);
        nextActiveId = filteredTabs[nextIdx].id;
      } else {
        nextActiveId = null;
      }
    }

    set({ openTabs: filteredTabs, activeTabId: nextActiveId });
  },

  setActiveTabId: (id) => set({ activeTabId: id }),

  setTheme: (theme) => {
    localStorage.setItem("postgresd_theme", theme);
    set({ theme });

    // Apply to HTML tag
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(pre-gradient-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  },
}));
