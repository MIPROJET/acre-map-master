import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Liste déroulante avec recherche intégrée (pas de saisie libre).
 * L'utilisateur ne peut choisir qu'une valeur du référentiel fourni.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Sélectionner…",
  emptyLabel = "Aucun résultat",
  disabled,
  className = "",
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = n
      ? options.filter((o) => o.label.toLowerCase().includes(n) || (o.hint ?? "").toLowerCase().includes(n))
      : options;
    return base.slice(0, 200);
  }, [options, q]);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        className="w-full h-11 px-3 rounded-md border bg-background text-left text-sm flex items-center justify-between gap-2 disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-muted-foreground text-xs shrink-0">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-card shadow-elevated overflow-hidden">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              className="w-full h-9 px-2.5 rounded-md border bg-background text-sm"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/70 ${
                    o.value === value ? "bg-primary/10 font-semibold" : ""
                  }`}
                >
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block text-[11px] text-muted-foreground truncate">{o.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
