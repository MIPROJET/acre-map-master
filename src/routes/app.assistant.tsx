import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant, getIntegrationsStatus, type AiMessage } from "@/lib/ai.functions";

export const Route = createFileRoute("/app/assistant")({
  component: AssistantPage,
  head: () => ({
    meta: [
      { title: "Assistant IA topographique — AcreMap" },
      { name: "description", content: "Assistant IA AcreMap : aide au levé GPS, morcellement 1 ha, voies, exports et plans." },
      { property: "og:title", content: "Assistant IA topographique — AcreMap" },
      { property: "og:description", content: "Aide intelligente pour vos levés, morcellements et exports AcreMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const status = useServerFn(getIntegrationsStatus);
  const [integrations, setIntegrations] = useState<{ ai: boolean; googleMaps: boolean } | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void status({}).then(setIntegrations).catch(() => setIntegrations(null)); }, [status]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    const next: AiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await ask({ data: { messages: next } });
      setMessages([...next, { role: "assistant", content: res.content }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Assistant IA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Posez vos questions terrain : précision GPS, morcellement 1 ha, voies, exports, plans.
        </p>
        {integrations && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded-md border ${integrations.ai ? "bg-primary/10 border-primary/30" : "bg-muted"}`}>
              IA : {integrations.ai ? "active" : "non configurée"}
            </span>
            <span className={`px-2.5 py-1 rounded-md border ${integrations.googleMaps ? "bg-primary/10 border-primary/30" : "bg-muted"}`}>
              Google Maps : {integrations.googleMaps ? "clé détectée" : "clé absente"}
            </span>
          </div>
        )}
      </header>

      <div className="rounded-xl border bg-card p-3 space-y-3 min-h-[240px]">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun échange pour le moment.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}>{m.content}</div>
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">L'assistant réfléchit…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          placeholder="Ex : comment gérer le reliquat après morcellement ?"
          className="flex-1 h-11 px-3 rounded-lg border bg-card text-sm" />
        <button onClick={() => void send()} disabled={busy}
          className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          Envoyer
        </button>
      </div>
    </div>
  );
}
