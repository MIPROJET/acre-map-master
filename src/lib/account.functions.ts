// Changement de mot de passe par l'utilisateur lui-même.
// Le drapeau must_change_password est effacé côté serveur UNIQUEMENT après une
// mise à jour réussie du mot de passe (les utilisateurs ne peuvent pas modifier
// ce champ directement : un trigger le protège).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw new Error("Impossible de mettre à jour le mot de passe");
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (pErr) throw new Error("Impossible de mettre à jour le profil");
    return { ok: true };
  });
