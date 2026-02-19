import { Database } from "lucide-react";
import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Database className="h-5 w-5" />
          Preclinical Case
        </Link>
      </div>
    </header>
  );
}
