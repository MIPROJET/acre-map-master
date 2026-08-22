import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AiMessage { role: "user" | "assistant"; content: string }

/** Assistant IA topographique (passerelle Lovable AI — Gemini / GPT / Claude). */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: AiMessage[]; model?: string }) => {
    if (!Array.isArray(input?.messages) || input.messages.length === 0) throw new Error("messages requis");
    return { messages: input.messages.slice(-20), model: input.model ?? "google/gemini-2.5-flash" };
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Clé IA manquante côté serveur.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: data.model,
        messages: [
          {
            role: "system",
            content:
              "Tu es l'assistant technique d'AcreMap (AgriCapital, Côte d'Ivoire) : levés GPS, morcellement strict en lots de 1 ha, réserves, voies de 3 à 6 m, exports DXF/GeoJSON/KML/Shapefile et plans PDF. Réponds en français, de façon concise et opérationnelle.",
          },
          ...data.messages,
        ],
      }),
    });
    if (!res.ok) throw new Error(`Passerelle IA: ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { content: json.choices?.[0]?.message?.content ?? "" };
  });

/** Statut des intégrations externes (cartes Google, IA). */
export const getIntegrationsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    ai: Boolean(process.env["LOVABLE_API_KEY"]),
    googleMaps: Boolean(process.env["GOOGLE_MAPS_API_KEY"]),
  }));

/** Clé Google Maps (restreinte par référent côté console Google). */
export const getGoogleMapsKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ key: process.env["GOOGLE_MAPS_API_KEY"] ?? null }));
