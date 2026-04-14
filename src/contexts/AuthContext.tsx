import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("aceleriq_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading] = useState(false);

  const login = useCallback(async (email: string, _password: string) => {
    // Mock login — will be replaced by Supabase auth
    const mockUser: User = {
      id: "1",
      email,
      name: email.split("@")[0],
    };
    setUser(mockUser);
    localStorage.setItem("aceleriq_user", JSON.stringify(mockUser));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("aceleriq_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
