import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, hasRole } from "@/lib/auth";
import {
  listUsersAdmin, createUserAdmin, setUserRoleAdmin,
  toggleUserDisabledAdmin, resetUserPasswordAdmin, updateUserAdmin,
} from "@/lib/admin-users.functions";
import { syncAll } from "@/lib/sync";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/app/users")({
  component: UsersPage,
  head: () => ({
    meta: [
      { title: "Utilisateurs — AcreMap" },
      { name: "description", content: "Administration des comptes AcreMap : création, modification, archivage et restauration des agents de terrain." },
      { property: "og:title", content: "Utilisateurs — AcreMap" },
      { property: "og:description", content: "Gérer les comptes agents, administrateurs et lecteurs d'AcreMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const updateFn = useServerFn(updateUserAdmin);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRoleSel] = useState<Role>("agent");
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; fullName: string; username: string } | null>(null);

  function flash(message: string) {
    setOk(message);
    window.setTimeout(() => setOk(null), 4000);
  }

  async function refresh() {
    setLoading(true); setErr(null);
    try { setRows(await list() as Row[]); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function refreshFromCloud() {
    setSyncing(true); setErr(null);
    try {
      await syncAll();
      await refresh();
      flash("Comptes et données rafraîchis depuis le cloud.");
    } catch (e: any) { setErr(e.message ?? "Rafraîchissement impossible"); }
    finally { setSyncing(false); }
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
      flash("Compte créé.");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function onSaveEdit() {
    if (!edit || edit.fullName.trim().length < 2 || edit.username.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      await updateFn({ data: { userId: edit.id, fullName: edit.fullName.trim(), username: edit.username.trim() } });
      setEdit(null);
      await refresh();
      flash("Compte modifié.");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function onArchive(u: Row) {
    const label = u.disabled ? "Restaurer ce compte ?" : "Archiver ce compte ? L'utilisateur ne pourra plus se connecter.";
    if (!confirm(label)) return;
    setBusy(true);
    try {
      await toggleDisabled({ data: { userId: u.id, disabled: !u.disabled } });
      await refresh();
      flash(u.disabled ? "Compte restauré." : "Compte archivé.");
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
    } catch (e: any) { setErr(e.message); }
  }

  const needle = q.trim().toLowerCase();
  const visible = rows
    .filter((u) => (showArchived ? true : !u.disabled))
    .filter((u) => !needle || `${u.fullName} ${u.username} ${u.email ?? ""}`.toLowerCase().includes(needle));

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Aucune inscription publique. L'administrateur crée chaque compte avec un mot de passe temporaire.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refreshFromCloud()} disabled={syncing}
            className="px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50">
            {syncing ? "Rafraîchissement…" : "↻ Rafraîchir depuis le cloud"}
          </button>
          <button onClick={() => nav({ to: "/app" })} className="text-xs px-3 py-2 rounded-lg border">Retour</button>
        </div>
      </div>

      {ok && <div className="text-sm px-3 py-2 rounded-md bg-success/10 text-success">{ok}</div>}
      {err && <div className="text-sm px-3 py-2 rounded-md bg-destructive/10 text-destructive">{err}</div>}

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

      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un compte…"
          className="h-10 px-3 rounded-md border bg-background flex-1 min-w-[12rem]" />
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Afficher les comptes archivés
        </label>
      </div>

      <section className="bg-card rounded-xl shadow-card divide-y">
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>}
        {!loading && visible.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Aucun compte.</div>}
        {visible.map((u) => (
          <div key={u.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {u.fullName}
                  {u.disabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">Archivé</span>}
                  {u.mustChangePassword && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn/20 text-warn">Mdp à changer</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.email ?? "(email indisponible)"}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={u.roles[0] ?? "agent"} onChange={async (e) => {
                  try { await setRole({ data: { userId: u.id, role: e.target.value as Role } }); await refresh(); flash("Rôle mis à jour."); }
                  catch (er: any) { setErr(er.message); }
                }} className="h-8 px-2 text-xs rounded-md border bg-background">
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Lecteur</option>
                </select>
                <button onClick={() => setEdit({ id: u.id, fullName: u.fullName, username: u.username })}
                  className="text-xs px-2 py-1 rounded border">Modifier</button>
                <button onClick={() => onResetPw(u.id)} className="text-xs px-2 py-1 rounded border">Réinit. mdp</button>
                <button onClick={() => void onArchive(u)} disabled={busy}
                  className={`text-xs px-2 py-1 rounded border disabled:opacity-50 ${u.disabled ? "text-success" : "text-destructive"}`}>
                  {u.disabled ? "Restaurer" : "Archiver"}
                </button>
              </div>
            </div>

            {edit?.id === u.id && (
              <div className="grid sm:grid-cols-3 gap-2 bg-muted/40 rounded-lg p-3">
                <input value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
                  placeholder="Nom complet" className="h-9 px-3 rounded-md border bg-background" />
                <input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })}
                  placeholder="Identifiant" className="h-9 px-3 rounded-md border bg-background" />
                <div className="flex gap-2">
                  <button onClick={() => void onSaveEdit()} disabled={busy}
                    className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60">
                    {busy ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button onClick={() => setEdit(null)} className="h-9 px-3 rounded-md border text-xs">Annuler</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
