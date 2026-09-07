import type { ApercuMode, PlanResult, PlanLot } from "@/lib/morcellement-v11";

/** Mélange un token de thème (oklch) avec du transparent — compatible charte actuelle. */
const tint = (token: string, pct: number) => `color-mix(in oklab, var(${token}) ${pct}%, transparent)`;

/** Aperçu vectoriel du morcellement (géométrie réelle du moteur). */
export function PlanPreview({
  plan, mode, selected, assigned, onSelect, reference,
}: {
  plan: PlanResult;
  mode: ApercuMode;
  selected?: string | null;
  assigned?: Record<string, { nom: string; compte: string }>;
  onSelect?: (code: string) => void;
  reference: string;
}) {
  const dim = (l: PlanLot) => {
    if (mode === "entreprise" && l.kind === "lot" && l.part !== "ac") return true;
    if (mode === "client" && l.kind === "lot" && l.code !== selected) return true;
    return false;
  };

  const fill = (l: PlanLot) => {
    if (l.kind === "reserve") return tint("--accent", 22);
    if (l.kind === "collecte") return tint("--warn", 30);
    if (!l.conforme) return tint("--destructive", 24);
    if (l.part === "ac") return tint("--primary", 24);
    return tint("--secondary", 18);
  };

  return (
    <svg viewBox="-4 -4 108 116" className="w-full h-full" role="img" aria-label="Aperçu du morcellement">
      <polygon points={plan.parcelle.map((p) => p.join(",")).join(" ")}
        fill="var(--muted)" stroke="var(--foreground)" strokeWidth="0.6" />

      {plan.voies.map((v, i) => (
        <polygon key={`v${i}`} points={v.poly.map((p) => p.join(",")).join(" ")}
          fill={tint("--foreground", 13)} stroke={tint("--foreground", 35)}
          strokeWidth="0.2" strokeDasharray="1 1" />
      ))}

      {plan.lots.map((l) => {
        const cx = l.poly.reduce((a, p) => a + p[0], 0) / l.poly.length;
        const cy = l.poly.reduce((a, p) => a + p[1], 0) / l.poly.length;
        const faded = dim(l);
        return (
          <g key={l.code} opacity={faded ? 0.22 : 1}
            onClick={() => l.kind === "lot" && onSelect?.(l.code)}
            className={l.kind === "lot" ? "cursor-pointer" : ""}>
            <polygon points={l.poly.map((p) => p.join(",")).join(" ")}
              fill={fill(l)}
              stroke={selected === l.code ? "var(--primary)" : tint("--foreground", 60)}
              strokeWidth={selected === l.code ? 0.8 : 0.25} />
            {l.kind === "lot" ? (
              <>
                <text x={cx} y={cy - 0.4} textAnchor="middle" fontSize="2.1" fontWeight="700"
                  fill="var(--foreground)">{l.code}</text>
                <text x={cx} y={cy + 2.2} textAnchor="middle" fontSize="1.5"
                  fill="var(--muted-foreground)">
                  {l.reelM2.toLocaleString("fr-FR")} m²
                </text>
                {assigned?.[l.code] && (
                  <text x={cx} y={cy + 4.4} textAnchor="middle" fontSize="1.4" fill="var(--primary)">
                    {assigned[l.code].nom}
                  </text>
                )}
              </>
            ) : (
              <text x={cx} y={cy + 1} textAnchor="middle" fontSize="1.7" fontWeight="700"
                fill="var(--foreground)">{l.label}</text>
            )}
          </g>
        );
      })}

      <text x="0" y="106" fontSize="2.6" fontWeight="700" fill="var(--foreground)">{reference}</text>
      <text x="0" y="110" fontSize="2" fill="var(--muted-foreground)">
        Coordonnées relatives · WGS84 / UTM 30N · aperçu {mode}
      </text>
    </svg>
  );
}
