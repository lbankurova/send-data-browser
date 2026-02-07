import { Database, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Database className="h-5 w-5" />
          SEND Data Browser
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <img
              src={user.picture}
              alt={user.name}
              className="h-7 w-7 rounded-full"
              referrerPolicy="no-referrer"
            />
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
