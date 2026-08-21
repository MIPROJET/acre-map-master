import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

function safeNext(v: unknown): string | undefined {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Connexion — AcreMap" },
      { name: "description", content: "Connexion à AcreMap : levé GPS, morcellement en lots d'1 ha et référencement des plantations." },
      { property: "og:title", content: "Connexion — AcreMap" },
      { property: "og:description", content: "Espace de travail terrain AgriCapital : mesurer, morceler, référencer." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goAfterAuth = () => {
    if (next) { window.location.href = next; return; }
    navigate({ to: "/app" });
  };
  const signIn = useAuth((s) => s.signIn);
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && user) {
      if (user.mustChangePassword) navigate({ to: "/app/change-password" });
      else goAfterAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const me = await signIn(u, p);
      if ((me as { mustChangePassword?: boolean }).mustChangePassword) navigate({ to: "/app/change-password" });
      else goAfterAuth();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[40%_60%]">
      <aside className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)", backgroundSize: "80px 80px" }} />
        <div className="relative">
          <Logo className="h-16 w-16" />
          <h1 className="mt-8 text-4xl font-bold leading-tight">Mesurer.<br/>Morceler.<br/>Référencer.</h1>
          <p className="mt-6 text-sm text-sidebar-foreground/70 max-w-sm">
            Outil de terrain AgriCapital pour le levé GPS, le morcellement automatique en lots d'1 ha
            et le référencement officiel des plantations.
          </p>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">
          AcreMap V1 — AgriCapital SARL · Daloa, Côte d'Ivoire
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 bg-background">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex flex-col items-center text-center">
            <Logo className="h-20 w-20" />
            <div className="mt-3 text-xl font-bold text-primary">AcreMap</div>
            <p className="text-xs text-muted-foreground">Mesurer. Morceler. Référencer.</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Connexion</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Accédez à votre espace de travail terrain. Les comptes sont créés par l'administrateur.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Adresse e-mail</span>
              <input value={u} onChange={(e) => setU(e.target.value)} type="email" required autoComplete="email"
                className="mt-1 w-full h-11 px-3 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Mot de passe</span>
              <input type="password" value={p} onChange={(e) => setP(e.target.value)} required autoComplete="current-password"
                className="mt-1 w-full h-11 px-3 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
          </div>

          {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{err}</div>}

          <button disabled={loading} type="submit"
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-secondary transition-colors disabled:opacity-60">
            {loading ? "Veuillez patienter…" : "Se connecter"}
          </button>

          <div className="text-center text-xs text-muted-foreground">
            Mot de passe oublié ? Contactez l'administrateur principal.
          </div>
        </form>
      </main>
    </div>
  );
}
