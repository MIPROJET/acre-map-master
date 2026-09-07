// Référencement AgriCapital — codes auto + génération référence officielle
// Format: AC – PP – SP001 – DOM001 – PARC001 – H03
export function refOfficielle(opts: {
  conv?: "PP" | "AC";
  spCode: string;
  domCode: string;
  parcCode: string;
  lotCode?: string;
}): string {
  const parts = ["AC", opts.conv ?? "PP", opts.spCode, opts.domCode, opts.parcCode];
  if (opts.lotCode) parts.push(opts.lotCode);
  return parts.join(" – ");
}

export function nextSequentialCode(prefix: "SP" | "DOM" | "PARC", existing: string[]): string {
  let max = 0;
  for (const c of existing) {
    const m = c.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
