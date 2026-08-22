import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_parcelles",
  title: "Lister les parcelles",
  description:
    "Liste les parcelles accessibles à l'utilisateur connecté (code, propriétaire, domaine, statut de convention).",
  inputSchema: {
    search: z.string().trim().optional().describe("Filtre sur le code ou le nom du propriétaire."),
    limit: z.number().int().min(1).max(200).default(50).describe("Nombre maximum de parcelles."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("parcelles")
      .select("id, code, owner_name, owner_phone, domaine_id, convention_date, convention_status, declared_area, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (search) {
      // Échappe les caractères spéciaux PostgREST/LIKE pour éviter toute injection de filtre.
      const safe = search.replace(/[,()."'*%\\_]/g, " ").trim();
      if (safe) query = query.or(`code.ilike.%${safe}%,owner_name.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { parcelles: data ?? [] },
    };
  },
});
