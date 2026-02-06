import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { BrowsingTree } from "@/components/tree/BrowsingTree";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { SelectionProvider } from "@/contexts/SelectionContext";

export function Layout() {
  return (
    <SelectionProvider>
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          <aside className="w-[260px] shrink-0 overflow-y-auto border-r">
            <BrowsingTree />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
          <aside className="w-[280px] shrink-0 overflow-y-auto border-l">
            <ContextPanel />
          </aside>
        </div>
      </div>
    </SelectionProvider>
  );
}
