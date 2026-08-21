import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, hasRole } from "@/lib/auth";
import {
  listUsersAdmin, createUserAdmin, setUserRoleAdmin,
  toggleUserDisabledAdmin, resetUserPasswordAdmin,
} from "@/lib/admin-users.functions";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/app/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "Utilisateurs — AcreMap" }] }),
});

type Row = {
  id: string; fullName: string; username: string; email: string | null;
  roles: string[]; mustChangePassword: boolean; disabled: boolean; createdAt: string;
};

function UsersPage() {
  const me = useAuth((s) => s.user);
  const nav = useNavigate();
  const list = useServerFn(listUsersAdmin);
  const createFn = useServerFn(createUserAdmin);
  const setRole = useServerFn(setUserRoleAdmin);
  const toggleDisabled = useServerFn(toggleUserDisabledAdmin);
  const resetPw = useServerFn(resetUserPasswordAdmin);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRoleSel] = useState<Role>("agent");
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true); setErr(null);
    try { setRows(await list() as Row[]); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (hasRole(me, "admin")) void refresh(); }, [me]);

  if (!me) return null;
  if (!hasRole(me, "admin")) {
    return <div className="p-8 text-center text-muted-foreground">Réservé à l'administrateur principal.</div>;
  }

  async function onCreate() {
    if (!name.trim() || !username.trim() || !email.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await createFn({ data: { fullName: name, username, email, role } });
      setCreated({ email: r.email, tempPassword: r.tempPassword });
      setName(""); setUsername(""); setEmail(""); setRoleSel("agent");
      await refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function onResetPw(id: string) {
    if (!confirm("Réinitialiser le mot de passe de cet utilisateur ?")) return;
    try {
      const r = await resetPw({ data: { userId: id } });
      const target = rows.find((u) => u.id === id);
      setCreated({ email: target?.email ?? "—", tempPassword: r.tempPassword });
      await refresh();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Aucune inscription publique. L'administrateur crée chaque compte avec un mot de passe temporaire.</p>
        </div>
        <button onClick={() => nav({ to: "/app" })} className="text-xs px-3 py-1.5 rounded-md border">Retour</button>
      </div>

      <section className="bg-card rounded-xl p-4 shadow-card space-y-3">
        <h2 className="font-semibold text-sm">Créer un compte</h2>
        <div className="grid sm:grid-cols-5 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet"
            className="h-10 px-3 rounded-md border bg-background sm:col-span-2" />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Identifiant"
            className="h-10 px-3 rounded-md border bg-background" />
          <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
            className="h-10 px-3 rounded-md border bg-background" />
          <select value={role} onChange={(e) => setRoleSel(e.target.value as Role)}
            className="h-10 px-3 rounded-md border bg-background">
            <option value="agent">Agent terrain</option>
            <option value="admin">Administrateur</option>
            <option value="viewer">Lecture seule</option>
          </select>
        </div>
        <button onClick={onCreate} disabled={busy}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60">
          + Créer le compte (mot de passe temporaire généré)
        </button>
        {err && <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</div>}
      </section>

      {created && (
        <section className="bg-success/10 border border-success/30 rounded-xl p-4 space-y-2">
          <div className="font-semibold text-sm text-success">Mot de passe temporaire généré — à transmettre une seule fois</div>
          <div className="text-xs">E-mail : <code className="bg-card px-2 py-1 rounded">{created.email}</code></div>
          <div className="text-xs">Mot de passe : <code className="bg-card px-2 py-1 rounded font-mono">{created.tempPassword}</code></div>
          <div className="text-xs text-muted-foreground">L'utilisateur devra le changer à sa première connexion.</div>
          <button onClick={() => setCreated(null)} className="text-xs underline">Fermer</button>
        </section>
      )}

      <section className="bg-card rounded-xl shadow-card divide-y">
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>}
        {!loading && rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Aucun compte.</div>}
        {rows.map((u) => (
          <div key={u.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {u.fullName}
                {u.disabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">Désactivé</span>}
                {u.mustChangePassword && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn/20 text-warn">Mdp à changer</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.email ?? "(email indisponible)"}</div>
            </div>
            <div className="flex items-center gap-2">
              <select value={u.roles[0] ?? "agent"} onChange={async (e) => {
                try { await setRole({ data: { userId: u.id, role: e.target.value as Role } }); await refresh(); }
                catch (er: any) { alert(er.message); }
              }} className="h-8 px-2 text-xs rounded-md border bg-background">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="viewer">Lecteur</option>
              </select>
              <button onClick={() => onResetPw(u.id)} className="text-xs px-2 py-1 rounded border">Réinit. mdp</button>
              <button onClick={async () => { await toggleDisabled({ data: { userId: u.id, disabled: !u.disabled } }); await refresh(); }}
                className={`text-xs px-2 py-1 rounded border ${u.disabled ? "text-success" : "text-destructive"}`}>
                {u.disabled ? "Réactiver" : "Désactiver"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
