import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_lots",
  title: "Lister les lots de morcellement",
  description:
    "Liste les lots issus du morcellement (code, superficie, réserve, attributaire), filtrables par parcelle.",
  inputSchema: {
    parcelle_id: z.string().trim().min(1).optional().describe("Ne retourner que les lots de cette parcelle."),
    only_reserve: z.boolean().default(false).describe("Ne retourner que les lots marqués comme réserve."),
    limit: z.number().int().min(1).max(500).default(100).describe("Nombre maximum de lots."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ parcelle_id, only_reserve, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("lots")
      .select("id, code, parcelle_id, measurement_id, area_m2, is_reserve, assignee_name, assigned_at")
      .order("code", { ascending: true })
      .limit(limit ?? 100);
    if (parcelle_id) query = query.eq("parcelle_id", parcelle_id);
    if (only_reserve) query = query.eq("is_reserve", true);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const lots = data ?? [];
    const totalHa = lots.reduce((sum: number, l: { area_m2: number | null }) => sum + (l.area_m2 ?? 0), 0) / 10000;
    const payload = { lots, count: lots.length, total_ha: Number(totalHa.toFixed(4)) };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
