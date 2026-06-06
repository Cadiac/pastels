import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Credentials, User } from "shared";
import { api } from "../api/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (creds: Credentials) => Promise<void>;
  register: (creds: Credentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (creds) => setUser(await api.login(creds)),
    register: async (creds) => setUser(await api.register(creds)),
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
