import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_parcelle",
  title: "Détail d'une parcelle",
  description:
    "Retourne une parcelle avec ses levés GPS (surface, périmètre, qualité) et ses lots de morcellement.",
  inputSchema: {
    parcelle_id: z.string().trim().min(1).optional().describe("Identifiant de la parcelle."),
    code: z.string().trim().min(1).optional().describe("Code de la parcelle, ex. PARC001."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ parcelle_id, code }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    if (!parcelle_id && !code) {
      return { content: [{ type: "text", text: "Fournissez parcelle_id ou code." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase.from("parcelles").select("*").limit(1);
    q = parcelle_id ? q.eq("id", parcelle_id) : q.eq("code", code!);
    const { data: parcelle, error } = await q.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!parcelle) return { content: [{ type: "text", text: "Parcelle introuvable." }], isError: true };

    const [{ data: measurements }, { data: lots }] = await Promise.all([
      supabase
        .from("measurements")
        .select("id, status, area_m2, perimeter_m, unit, qa, validated_at, created_at")
        .eq("parcelle_id", parcelle.id),
      supabase
        .from("lots")
        .select("id, code, area_m2, is_reserve, assignee_name, assigned_at, measurement_id")
        .eq("parcelle_id", parcelle.id),
    ]);

    const payload = { parcelle, measurements: measurements ?? [], lots: lots ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
