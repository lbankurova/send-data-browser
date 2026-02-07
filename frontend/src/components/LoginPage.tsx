import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { FlaskConical } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "var(--background)" }}>
      <div
        className="w-full max-w-sm rounded-lg border p-8 shadow-sm"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <FlaskConical className="h-6 w-6" style={{ color: "var(--primary)" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              SEND Data Browser
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Preclinical study data explorer
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <GoogleLogin
            onSuccess={(response) => {
              if (response.credential) {
                const err = login(response.credential);
                setError(err);
              }
            }}
            onError={() => setError("Google sign-in failed")}
            theme="outline"
            size="large"
            width="320"
          />

          {error && (
            <div
              className="w-full rounded-md px-3 py-2 text-center text-sm"
              style={{ backgroundColor: "var(--adverse-bg)", color: "var(--adverse-text)" }}
            >
              {error}
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Restricted to @datagrok.ai accounts
          </p>
        </div>
      </div>
    </div>
  );
}
