import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevents redundant queries when focusing the desktop window
      retry: false,
      staleTime: 5 * 60 * 1000,   // Cache metadata for 5 minutes
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const theme = localStorage.getItem("postgresd_theme") || "system";
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(dark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
