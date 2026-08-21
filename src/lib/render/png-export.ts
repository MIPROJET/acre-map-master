// Schematic PNG export for SP and Domaine levels.
// Renders a single canvas: header + map area showing every parcelle/lot polygon
// (auto-fitted bounding box) + a legend listing parcelles and their measured area.
import { db } from "@/lib/db";
import type { Domaine, Lot, Parcelle, SP } from "@/lib/types";

interface RenderOpts {
  title: string;       // e.g. "SP001 — Daloa-Centre"
  subtitle: string;    // e.g. "District > Région > Département · 12 parcelles"
  parcelles: Parcelle[];
  lots: Lot[];
  width?: number;
  height?: number;
}

const PALETTE = ["#3A7A2A", "#D97706", "#2563EB", "#9333EA", "#DC2626", "#0891B2", "#65A30D", "#DB2777"];

function bbox(lots: Lot[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, any = false;
  for (const l of lots) {
    for (const p of l.polygon) {
      any = true;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
  }
  if (!any) return null;
  // pad ~5%
  const padLat = (maxLat - minLat || 0.001) * 0.05;
  const padLng = (maxLng - minLng || 0.001) * 0.05;
  return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

export function renderHierarchyPng(opts: RenderOpts): HTMLCanvasElement {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1131; // ~A3 paysage @ 134 dpi
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#F8FAF7"; ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = "#3A7A2A"; ctx.fillRect(0, 0, W, 90);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 30px Inter, sans-serif";
  ctx.fillText("AcreMap — Plan schématique", 30, 40);
  ctx.font = "16px Inter, sans-serif";
  ctx.fillText(new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }), 30, 70);

  // Title
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 26px Inter, sans-serif";
  ctx.fillText(opts.title, 30, 130);
  ctx.fillStyle = "#475569";
  ctx.font = "15px Inter, sans-serif";
  ctx.fillText(opts.subtitle, 30, 156);

  // Layout: map left, legend right
  const mapX = 30, mapY = 180, mapW = W - 480, mapH = H - 240;
  const legendX = mapX + mapW + 20, legendY = mapY, legendW = W - legendX - 30;

  // Map frame
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = "#CBD5E1"; ctx.lineWidth = 1; ctx.strokeRect(mapX, mapY, mapW, mapH);

  // Grid
  ctx.strokeStyle = "#E2E8F0"; ctx.lineWidth = 0.5;
  for (let x = mapX; x <= mapX + mapW; x += 50) { ctx.beginPath(); ctx.moveTo(x, mapY); ctx.lineTo(x, mapY + mapH); ctx.stroke(); }
  for (let y = mapY; y <= mapY + mapH; y += 50) { ctx.beginPath(); ctx.moveTo(mapX, y); ctx.lineTo(mapX + mapW, y); ctx.stroke(); }

  const box = bbox(opts.lots);
  if (box) {
    const lngSpan = box.maxLng - box.minLng;
    const latSpan = box.maxLat - box.minLat;
    const scale = Math.min(mapW / lngSpan, mapH / latSpan) * 0.92;
    const cx = mapX + mapW / 2;
    const cy = mapY + mapH / 2;
    const midLng = (box.minLng + box.maxLng) / 2;
    const midLat = (box.minLat + box.maxLat) / 2;
    const project = (lat: number, lng: number) => ({
      x: cx + (lng - midLng) * scale,
      y: cy - (lat - midLat) * scale,
    });

    // group lots by parcelleId for coloring
    const parcelleColor = new Map<string, string>();
    opts.parcelles.forEach((p, i) => parcelleColor.set(p.id, PALETTE[i % PALETTE.length]));

    for (const lot of opts.lots) {
      if (lot.polygon.length < 3) continue;
      const color = parcelleColor.get(lot.parcelleId) ?? "#3A7A2A";
      ctx.beginPath();
      lot.polygon.forEach((p, i) => {
        const pt = project(p.lat, p.lng);
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fillStyle = color + "30";
      ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      // label
      const cx0 = lot.polygon.reduce((s, p) => s + p.lng, 0) / lot.polygon.length;
      const cy0 = lot.polygon.reduce((s, p) => s + p.lat, 0) / lot.polygon.length;
      const ctr = project(cy0, cx0);
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lot.code, ctr.x, ctr.y);
      ctx.textAlign = "start";
    }
  } else {
    ctx.fillStyle = "#94A3B8";
    ctx.font = "18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Aucune mesure géométrique disponible", mapX + mapW / 2, mapY + mapH / 2);
    ctx.textAlign = "start";
  }

  // Legend
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(legendX, legendY, legendW, mapH);
  ctx.strokeStyle = "#CBD5E1"; ctx.strokeRect(legendX, legendY, legendW, mapH);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 16px Inter, sans-serif";
  ctx.fillText("Légende — Parcelles", legendX + 12, legendY + 26);

  let ly = legendY + 50;
  opts.parcelles.forEach((p, i) => {
    if (ly > legendY + mapH - 30) return;
    const color = PALETTE[i % PALETTE.length];
    ctx.fillStyle = color; ctx.fillRect(legendX + 12, ly - 11, 14, 14);
    ctx.fillStyle = "#0F172A"; ctx.font = "bold 12px Inter, sans-serif";
    ctx.fillText(`${p.code} · ${p.ownerName}`, legendX + 34, ly);
    const lotsCount = opts.lots.filter((l) => l.parcelleId === p.id).length;
    const areaSum = opts.lots.filter((l) => l.parcelleId === p.id).reduce((s, l) => s + l.areaM2, 0);
    ctx.fillStyle = "#64748B"; ctx.font = "11px Inter, sans-serif";
    ctx.fillText(`${lotsCount} lot(s) · ${(areaSum / 10000).toFixed(2)} ha`, legendX + 34, ly + 14);
    ly += 38;
  });

  // Footer
  ctx.fillStyle = "#94A3B8"; ctx.font = "11px Inter, sans-serif";
  ctx.fillText("Document généré par AcreMap · AgriCapital SARL", 30, H - 20);
  ctx.textAlign = "right";
  ctx.fillText(`${opts.parcelles.length} parcelle(s) · ${opts.lots.length} lot(s)`, W - 30, H - 20);
  ctx.textAlign = "start";

  return canvas;
}

export async function exportSpPng(sp: SP): Promise<void> {
  const d = db();
  const domaines = await d.domaines.where("spId").equals(sp.id).toArray();
  const domIds = domaines.map((x) => x.id);
  const parcelles = (await d.parcelles.toArray()).filter((p) => domIds.includes(p.domaineId));
  const parcIds = parcelles.map((p) => p.id);
  const lots = (await d.lots.toArray()).filter((l) => parcIds.includes(l.parcelleId));
  const canvas = renderHierarchyPng({
    title: `${sp.code} — ${sp.name}`,
    subtitle: `${sp.district} › ${sp.region} › ${sp.departement} · ${domaines.length} domaine(s) · ${parcelles.length} parcelle(s)`,
    parcelles, lots,
  });
  downloadCanvas(canvas, `AcreMap_${sp.code}_${sp.name.replace(/\s+/g, "-")}.png`);
}

export async function exportDomainePng(dom: Domaine, sp?: SP): Promise<void> {
  const d = db();
  const parcelles = (await d.parcelles.toArray()).filter((p) => p.domaineId === dom.id);
  const parcIds = parcelles.map((p) => p.id);
  const lots = (await d.lots.toArray()).filter((l) => parcIds.includes(l.parcelleId));
  const canvas = renderHierarchyPng({
    title: `${dom.code} — ${dom.name}`,
    subtitle: sp ? `${sp.code} ${sp.name} · ${parcelles.length} parcelle(s)` : `${parcelles.length} parcelle(s)`,
    parcelles, lots,
  });
  downloadCanvas(canvas, `AcreMap_${dom.code}_${dom.name.replace(/\s+/g, "-")}.png`);
}
