// Admin-only server functions for user lifecycle management.
// All operations enforce admin role server-side via has_role().
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Réservé à l'administrateur");
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const listUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }, listed] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, username, must_change_password, disabled, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const emailById = new Map((listed.data?.users ?? []).map((u) => [u.id, u.email]));
    const rolesById = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = rolesById.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rolesById.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      username: p.username,
      email: emailById.get(p.id) ?? null,
      roles: rolesById.get(p.id) ?? [],
      mustChangePassword: p.must_change_password,
      disabled: p.disabled,
      createdAt: p.created_at,
    }));
  });

export const createUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    fullName: z.string().min(2),
    username: z.string().min(2),
    email: z.string().email(),
    role: z.enum(["admin", "agent", "viewer"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = randomPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création échouée");
    // Override profile (trigger creates a default one) with the chosen values and force change-password.
    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      full_name: data.fullName,
      username: data.username,
      must_change_password: true,
      disabled: false,
    });
    // Clear default 'agent' role and assign chosen role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.role });
    return { id: created.user.id, email: data.email, tempPassword };
  });

export const setUserRoleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: z.enum(["admin", "agent", "viewer"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

export const toggleUserDisabledAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), disabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ disabled: data.disabled }).eq("id", data.userId);
    // Revoke/restore the Supabase Auth account itself so existing tokens stop working.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    });
    if (error) throw new Error("Impossible de mettre à jour le compte");
    return { ok: true };
  });

export const resetUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = randomPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: tempPassword });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.userId);
    return { tempPassword };
  });

// SÉCURITÉ : l'ancien endpoint « bootstrapFirstAdmin » a été supprimé.
// Il permettait à n'importe quel compte connecté de s'attribuer le rôle admin
// dès qu'aucun admin n'existait. La promotion du premier administrateur doit
// se faire manuellement en base (SQL Editor) ou via setUserRoleAdmin par un admin.

