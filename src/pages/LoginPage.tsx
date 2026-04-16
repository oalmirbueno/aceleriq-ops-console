import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, Zap, ArrowRight } from "lucide-react";
import logo from "@/assets/logo-aceleriq.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient background */}
      <div className="grid-perspective" aria-hidden />
      <div className="login-orb" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.08),_transparent_60%)]"
      />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
        {/* LEFT — Brand panel (desktop only) */}
        <aside className="relative hidden flex-col justify-between border-r border-border/60 px-12 py-10 lg:flex">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Aceleriq" className="h-9" />
            <span className="label-sm border-l border-border pl-3">OPS · v1.0</span>
          </div>

          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Sistema operacional interno
            </div>

            <h1 className="text-balance font-outfit text-5xl font-light leading-[1.05] tracking-tight">
              Operação acelerada,
              <br />
              <span className="bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
                decisão em tempo real.
              </span>
            </h1>

            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              Centralize briefings, frentes, assets e produção de cada cliente em um único painel
              auditável.
            </p>

            <ul className="grid max-w-md gap-3 stagger-children">
              {[
                { icon: Zap, label: "Frentes e tasks com automação operacional" },
                { icon: Sparkles, label: "Briefings estruturados com IA" },
                { icon: ShieldCheck, label: "Acesso protegido por papel e RLS" },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm text-foreground/90 backdrop-blur-sm"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>© {new Date().getFullYear()} Aceleriq</span>
            <span className="font-mono">acel-ops-core</span>
          </div>
        </aside>

        {/* RIGHT — Auth form */}
        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="login-card w-full max-w-md">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center justify-center lg:hidden">
              <img src={logo} alt="Aceleriq" className="h-10" />
            </div>

            <div className="rounded-2xl border border-border/80 bg-card/70 p-7 shadow-[0_20px_60px_-30px_rgba(0,255,102,0.25)] backdrop-blur-xl sm:p-9">
              <div className="mb-7 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  Conexão segura
                </div>
                <h2 className="font-outfit text-2xl font-medium tracking-tight text-foreground">
                  Entrar no painel
                </h2>
                <p className="text-sm text-muted-foreground">
                  Use suas credenciais corporativas para acessar a operação.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="login-form space-y-5">
                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="label-sm block">
                    E-mail
                  </label>
                  <div className="group relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-border bg-secondary/70 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="label-sm block">
                      Senha
                    </label>
                    <button
                      type="button"
                      className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-primary"
                      onClick={() =>
                        setError("Solicite a redefinição com o administrador da conta.")
                      }
                    >
                      Esqueci
                    </button>
                  </div>
                  <div className="group relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-11 w-full rounded-lg border border-border bg-secondary/70 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="animate-fade-in rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn group relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                      Entrando…
                    </>
                  ) : (
                    <>
                      Entrar no painel
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
                  Sessão criptografada · auditada por papel
                </div>
              </form>
            </div>

            <p className="mt-6 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 lg:hidden">
              © {new Date().getFullYear()} Aceleriq · OPS
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
