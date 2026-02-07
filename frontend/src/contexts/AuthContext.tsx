import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";

interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (credential: string) => string | null;
  logout: () => void;
}

const AUTH_KEY = "send-browser-auth";

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  login: () => null,
  logout: () => {},
});

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((credential: string): string | null => {
    try {
      const payload = decodeJwtPayload(credential);
      if (payload.hd !== "datagrok.ai") {
        return "Access restricted to @datagrok.ai accounts";
      }
      const authUser: AuthUser = {
        email: payload.email as string,
        name: payload.name as string,
        picture: payload.picture as string,
      };
      setUser(authUser);
      localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
      return null;
    } catch {
      return "Failed to verify credentials";
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      localStorage.removeItem(AUTH_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
