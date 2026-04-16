import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo-aceleriq.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await login(email, password);
      if (ok) navigate("/ops", { replace: true });
      else setError("Credenciais inválidas. Verifique e-mail e senha.");
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <div className="grid-perspective" />
      <div className="login-orb" />

      <div className="login-card relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-10">
        <div className="mb-10 flex justify-center">
          <img src={logo} alt="Aceleriq" className="h-12" />
        </div>

        <div className="login-form">
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Acesse o painel de operações
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-sm mb-1.5 block">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="label-sm mb-1.5 block">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-btn w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
