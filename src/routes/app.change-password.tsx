import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/account.functions";

export const Route = createFileRoute("/app/change-password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Changer mot de passe — AcreMap" }] }),
});

function ChangePasswordPage() {
  const nav = useNavigate();
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const updatePassword = useServerFn(changeOwnPassword);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (p1.length < 8) { setErr("Mot de passe : 8 caractères minimum"); return; }
    if (p1 !== p2) { setErr("Les deux mots de passe ne correspondent pas"); return; }
    setBusy(true);
    try {
      await updatePassword({ data: { password: p1 } });
      await refreshProfile();
      nav({ to: "/app" });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-card rounded-xl shadow-card p-6 space-y-4">
        <div className="text-center">
          <Logo className="h-14 w-14 mx-auto" />
          <h1 className="mt-3 text-xl font-bold">Changement de mot de passe requis</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Vous utilisez un mot de passe temporaire. Définissez votre mot de passe personnel pour continuer.
          </p>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Nouveau mot de passe</span>
          <input type="password" value={p1} onChange={(e) => setP1(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-lg border bg-background" autoFocus />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Confirmer</span>
          <input type="password" value={p2} onChange={(e) => setP2(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-lg border bg-background" />
        </label>
        {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</div>}
        <button disabled={busy} type="submit"
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">
          {busy ? "Enregistrement…" : "Valider et continuer"}
        </button>
      </form>
    </div>
  );
}
