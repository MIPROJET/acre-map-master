// Real Supabase auth — exposes the same shape that the rest of the app already consumes
// (zustand store with { user, hydrated, signIn, signOut }). The "user" shape mirrors the
// legacy User type so existing pages keep working without changes.
import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { Role, User } from "./types";

interface AuthState {
  user: (User & { email?: string; mustChangePassword?: boolean; disabled?: boolean }) | null;
  hydrated: boolean;
  signIn: (username: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

async function loadUserFromSession(userId: string, email: string | undefined) {
  const [{ data: profile }, { data: rolesRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, must_change_password, disabled").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roles = (rolesRows ?? []).map((r) => r.role as Role);
  const role: Role = roles.includes("admin") ? "admin" : roles.includes("agent") ? "agent" : "viewer";
  return {
    id: userId,
    fullName: profile?.full_name ?? email?.split("@")[0] ?? "Utilisateur",
    username: profile?.username ?? email?.split("@")[0] ?? "user",
    role,
    email,
    mustChangePassword: profile?.must_change_password ?? false,
    disabled: profile?.disabled ?? false,
    createdAt: Date.now(),
  };
}

export const useAuth = create<AuthState>()((set, get) => ({
  user: null,
  hydrated: false,
  signIn: async (identifier, password) => {
    // identifier may be an email OR a username. If no "@", look up email via profiles.
    let email = identifier.includes("@") ? identifier : "";
    if (!email) {
      const { data } = await supabase.from("profiles").select("id, username").eq("username", identifier).maybeSingle();
      if (!data) throw new Error("Identifiant inconnu");
      // We cannot read the auth email of an arbitrary user from the client; require email login for now.
      throw new Error("Connectez-vous avec votre adresse e-mail (pas le nom d'utilisateur).");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error(error?.message ?? "Identifiants invalides");
    const u = await loadUserFromSession(data.user.id, data.user.email ?? email);
    if (u.disabled) {
      await supabase.auth.signOut();
      throw new Error("Ce compte est désactivé. Contactez l'administrateur.");
    }
    set({ user: u });
    return u;
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },
  refreshProfile: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { set({ user: null, hydrated: true }); return; }
    const u = await loadUserFromSession(data.user.id, data.user.email ?? undefined);
    set({ user: u });
  },
}));

// Bootstrap session on app mount (client-only)
if (typeof window !== "undefined") {
  supabase.auth.getUser().then(async ({ data }) => {
    if (data.user) {
      try {
        const u = await loadUserFromSession(data.user.id, data.user.email ?? undefined);
        useAuth.setState({ user: u.disabled ? null : u, hydrated: true });
        if (u.disabled) await supabase.auth.signOut();
      } catch {
        useAuth.setState({ user: null, hydrated: true });
      }
    } else {
      useAuth.setState({ hydrated: true });
    }
  });
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      useAuth.setState({ user: null, hydrated: true });
      return;
    }
    if ((event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") && session?.user) {
      try {
        const u = await loadUserFromSession(session.user.id, session.user.email ?? undefined);
        useAuth.setState({ user: u.disabled ? null : u, hydrated: true });
      } catch {
        useAuth.setState({ hydrated: true });
      }
    }
  });
}

export const hasRole = (user: { role: Role } | null, ...roles: Role[]) => !!user && roles.includes(user.role);
