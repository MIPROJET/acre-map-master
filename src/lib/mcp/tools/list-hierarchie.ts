import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_hierarchie",
  title: "Lister la hiérarchie géographique",
  description:
    "Liste les sous-préfectures (SP) et les domaines : district, région, département, codes et rattachements.",
  inputSchema: {
    sp_id: z.string().trim().min(1).optional().describe("Ne retourner que les domaines de cette SP."),
    limit: z.number().int().min(1).max(200).default(100).describe("Nombre maximum d'éléments par niveau."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sp_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const max = limit ?? 100;
    let domainesQuery = supabase
      .from("domaines")
      .select("id, code, name, sp_id, description, created_at")
      .limit(max);
    if (sp_id) domainesQuery = domainesQuery.eq("sp_id", sp_id);

    const [{ data: sps, error: spError }, { data: domaines, error: domError }] = await Promise.all([
      supabase.from("sps").select("id, code, name, district, region, departement, created_at").limit(max),
      domainesQuery,
    ]);
    const error = spError ?? domError;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = { sps: sps ?? [], domaines: domaines ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
