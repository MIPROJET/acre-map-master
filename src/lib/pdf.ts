// AcreMap — Plan de Morcellement Parcelle Agricole (2D, mono-page A3 paysage).
// Mise en page calquée sur le modèle CNEFEHB / AgriCapital SARL.
import { jsPDF } from "jspdf";
import proj4 from "proj4";
import type { Domaine, Lot, Measurement, Parcelle, SP } from "./types";
import { polygonAreaM2, polygonPerimeterM } from "./gps";
import { refOfficielle } from "./ref";
import logo from "../assets/agricapital-logo.jpg";

interface BuildArgs {
  measurement: Measurement;
  parcelle?: Parcelle | null;
  domaine?: Domaine | null;
  sp?: SP | null;
  lots?: Lot[];
  voie?: { lat: number; lng: number }[][];
  operatorName: string;
  organisation?: string;
  format?: "a4" | "a3" | "a2" | "a1";
}

type RGB = readonly [number, number, number];
const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const stroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
const ink = (doc: jsPDF, c: RGB | number) =>
  typeof c === "number" ? doc.setTextColor(c, c, c) : doc.setTextColor(c[0], c[1], c[2]);

// ----- Palette du modèle -----
const C: Record<string, RGB> = {
  headerGreen: [58, 122, 42],
  sectionDark: [45, 90, 35],
  parcelGreen: [76, 175, 80],
  lotFill: [212, 232, 184],
  lotStroke: [110, 150, 80],
  roadFill: [196, 168, 120],
  roadStroke: [140, 110, 70],
  borneFill: [255, 255, 255],
  borneStroke: [40, 40, 40],
  gridLight: [220, 220, 220],
  rowAlt: [245, 245, 245],
  tableHeader: [232, 240, 226],
  textMuted: [110, 110, 110],
};

function utmZone(lng: number) { return Math.floor((lng + 180) / 6) + 1; }

export function buildGeometrePdf(args: BuildArgs): Blob {
  const {
    measurement: m, parcelle, domaine, sp, lots = [], voie = [],
    operatorName, organisation = "AgriCapital SARL",
    format = "a3",
  } = args;

  const doc = new jsPDF({ unit: "mm", format, orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 6;

  const reference = parcelle && domaine && sp
    ? refOfficielle({ spCode: sp.code, domCode: domaine.code, parcCode: parcelle.code })
    : `MES-${m.id.slice(0, 8).toUpperCase()}`;

  // ============ EN-TÊTE ============
  fill(doc, C.headerGreen);
  doc.rect(0, 0, W, 22, "F");
  try { doc.addImage(logo, "JPEG", M, 3, 16, 16); } catch { /* ignore */ }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(organisation.toUpperCase(), M + 20, 9);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Promotion Agricole & Services Intégrés", M + 20, 14);

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("PLAN DE MORCELLEMENT — PARCELLE AGRICOLE", W / 2, 12, { align: "center" });

  // Boîte référence à droite
  const refBoxW = 70, refBoxH = 12;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(255, 255, 255);
  doc.roundedRect(W - M - refBoxW, 5, refBoxW, refBoxH, 1.5, 1.5, "F");
  ink(doc, C.headerGreen);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(reference, W - M - refBoxW / 2, 13, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // ============ LAYOUT 3 COLONNES ============
  const top = 26;
  const bottom = H - M;
  const colLeftW = 78;
  const colRightW = 88;
  const planX = M + colLeftW + 4;
  const planY = top;
  const planW = W - 2 * M - colLeftW - colRightW - 8;
  const planH = bottom - top;

  // ============ COLONNE GAUCHE ============
  let ly = top;
  const lx = M;

  // Informations générales
  sectionTitle(doc, lx, ly, colLeftW, "INFORMATIONS GÉNÉRALES");
  ly += 6;
  const totalArea = polygonAreaM2(m.points);
  const voieArea = voie.reduce((s, v) => s + polygonAreaM2(v), 0);
  const lotsArea = lots.filter((l) => !l.isReserve).reduce((s, l) => s + l.areaM2, 0);
  const reserveArea = lots.filter((l) => l.isReserve).reduce((s, l) => s + l.areaM2, 0);
  const netArea = totalArea - voieArea;
  const normalLots = lots.filter((l) => !l.isReserve);
  const targetHa = normalLots.length > 0 ? Math.round(normalLots[0].areaM2 / 10000) || 1 : 1;

  const infoRows: [string, string][] = [
    ["Sous-Préfecture", sp ? `${sp.code} — ${sp.name}` : "—"],
    ["Domaine", domaine?.code ?? "—"],
    ["Parcelle", parcelle?.code ?? "—"],
    ["Référence officielle", reference],
    ["Superficie totale", `${(totalArea / 10000).toFixed(2)} hectares`],
    ["Nombre de lots", `${normalLots.length} lots de ${targetHa} hectare${targetHa > 1 ? "s" : ""}`],
    ["Type de convention", conventionLabel(parcelle?.conventionStatus)],
    ["Date du plan", new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })],
    ["Système de référence", `WGS 84 / UTM Zone ${m.points[0] ? utmZone(m.points[0].lng) : 30}${m.points[0] && m.points[0].lat >= 0 ? "N" : "S"}`],
  ];
  ly = drawKVTable(doc, lx, ly, colLeftW, infoRows, 4.6);
  ly += 4;

  // Tableau des superficies
  sectionTitle(doc, lx, ly, colLeftW, "TABLEAU DES SUPERFICIES");
  ly += 6;
  const surfRows: [string, string][] = [
    ["Superficie brute (mesurée)", `${(totalArea / 10000).toFixed(2)} ha`],
    ["Piste d'accès centrale", voie.length ? `${(voieArea / 10000).toFixed(2)} ha` : "—"],
    ["Superficie nette exploitable", `${(netArea / 10000).toFixed(2)} ha`],
    ["Nombre de lots", `${normalLots.length} lots`],
    ["Superficie moyenne par lot", normalLots.length ? `${(lotsArea / normalLots.length / 10000).toFixed(2)} ha` : "—"],
  ];
  if (reserveArea > 50) surfRows.push(["Réserve", `${(reserveArea / 10000).toFixed(2)} ha`]);
  ly = drawTwoColTable(doc, lx, ly, colLeftW, ["DÉSIGNATION", "SUPERFICIE"], surfRows);
  ly += 4;

  // Localisation
  sectionTitle(doc, lx, ly, colLeftW, "LOCALISATION");
  ly += 6;
  const locH = 28;
  doc.setDrawColor(180, 180, 180); doc.setFillColor(248, 248, 245);
  doc.rect(lx, ly, colLeftW, locH, "FD");
  // Mini cible
  const mlx = lx + colLeftW / 2, mly = ly + locH / 2 - 2;
  stroke(doc, C.parcelGreen); doc.setLineWidth(0.4);
  doc.circle(mlx, mly, 1.6, "S");
  doc.setFillColor(220, 60, 50); doc.circle(mlx, mly, 0.9, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(80, 80, 80);
  doc.text("Parcelle", mlx + 2.4, mly + 0.5);
  doc.setFontSize(7); doc.setTextColor(40, 40, 40);
  doc.text(sp ? `${sp.code} — ${sp.name}` : "—", lx + colLeftW / 2, ly + locH - 5, { align: "center" });
  doc.setFontSize(6); ink(doc, C.textMuted);
  doc.text(sp ? `Département de ${sp.departement}` : "", lx + colLeftW / 2, ly + locH - 2.5, { align: "center" });
  doc.text(sp ? `Région du ${sp.region}` : "", lx + colLeftW / 2, ly + locH - 0.6, { align: "center" });
  ly += locH + 4;

  // Notes
  sectionTitle(doc, lx, ly, colLeftW, "NOTES");
  ly += 6;
  doc.setTextColor(40, 40, 40); doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
  const notes = [
    "Les superficies sont approximatives et pourront être ajustées après bornage définitif.",
    "Les limites sont issues d'un levé GPS et matérialisées sur le terrain par des bornes.",
    `Chaque lot hectare fait l'objet d'un plan polygonal et d'un rapport technique individuel.`,
  ];
  for (const n of notes) {
    fill(doc, C.parcelGreen); doc.circle(lx + 1.5, ly - 0.5, 0.7, "F");
    const lines = doc.splitTextToSize(n, colLeftW - 5);
    doc.text(lines, lx + 4, ly);
    ly += lines.length * 2.8 + 1.5;
  }

  // Dressé par
  ly = Math.max(ly + 2, bottom - 26);
  doc.setDrawColor(180, 180, 180); doc.line(lx, ly, lx + colLeftW, ly);
  ly += 4;
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(40, 40, 40);
  doc.text(`Dressé par : ${operatorName || "CNEFEHB"}`, lx + 1, ly);
  ly += 3.5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(6); ink(doc, C.textMuted);
  doc.text("Cabinet de Négoce et d'Expertise Foncière", lx + 1, ly); ly += 2.6;
  doc.text("Environnementale Hydraulique et Bâtiment", lx + 1, ly); ly += 2.6;
  doc.text("Géomètre-Expert", lx + 1, ly); ly += 4;
  doc.setDrawColor(200, 200, 200); doc.line(lx + 1, ly, lx + colLeftW - 1, ly);
  doc.setFontSize(5.5); ink(doc, C.textMuted);
  doc.text("Cachet & Signature", lx + colLeftW / 2, ly + 2, { align: "center" });

  // ============ CENTRE — PLAN 2D ============
  doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.3);
  doc.rect(planX, planY, planW, planH);

  let utmZ = 30, north = true;
  let projDef = "+proj=utm +zone=30 +north +datum=WGS84 +units=m +no_defs";

  if (m.points.length >= 3) {
    utmZ = utmZone(m.points[0].lng);
    north = m.points[0].lat >= 0;
    projDef = `+proj=utm +zone=${utmZ} ${north ? "+north" : "+south"} +datum=WGS84 +units=m +no_defs`;
    const parcUtm = m.points.map((p) => proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);
    const allUtm: [number, number][] = [...parcUtm];
    for (const l of lots) for (const p of l.polygon) allUtm.push(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);
    for (const v of voie) for (const p of v) allUtm.push(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);

    const xs = allUtm.map((p) => p[0]), ys = allUtm.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padTop = 14, padBot = 12, padL = 14, padR = 14;
    const innerW = planW - padL - padR, innerH = planH - padTop - padBot;
    const dx = Math.max(1, maxX - minX), dy = Math.max(1, maxY - minY);
    const scale = Math.min(innerW / dx, innerH / dy);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const project = (x: number, y2: number): [number, number] => [
      planX + planW / 2 + (x - cx) * scale,
      planY + planH / 2 - (y2 - cy) * scale,
    ];

    // Fond clair vert pâle
    doc.setFillColor(238, 244, 230);
    doc.rect(planX + 0.5, planY + 0.5, planW - 1, planH - 1, "F");

    // Grille UTM + étiquettes
    const gridStep = niceStep(Math.max(dx, dy) / 6);
    const gx0 = Math.ceil(minX / gridStep) * gridStep;
    const gy0 = Math.ceil(minY / gridStep) * gridStep;
    stroke(doc, C.gridLight); doc.setLineWidth(0.1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(90, 90, 90);
    for (let gx = gx0; gx <= maxX; gx += gridStep) {
      const [px] = project(gx, minY);
      doc.line(px, planY + 4, px, planY + planH - 4);
      doc.text(`${gx.toFixed(0)}`, px, planY + 3, { align: "center" });
      doc.text(`${gx.toFixed(0)}`, px, planY + planH - 1.2, { align: "center" });
    }
    for (let gy = gy0; gy <= maxY; gy += gridStep) {
      const [, py] = project(minX, gy);
      doc.line(planX + 4, py, planX + planW - 4, py);
      doc.text(`${gy.toFixed(0)}`, planX + 3, py, { align: "left", baseline: "middle" });
      doc.text(`${gy.toFixed(0)}`, planX + planW - 1, py, { align: "right", baseline: "middle" });
    }

    // Lots (vert clair uniforme) — avec étiquettes de longueur des côtés
    doc.setLineWidth(0.15);
    lots.forEach((l) => {
      if (l.polygon.length < 3) return;
      const pts = l.polygon.map((p) => project(...(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number])));
      const ptsUtm = l.polygon.map((p) => proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);
      doc.setFillColor(...(l.isReserve ? [248, 232, 200] as const : C.lotFill));
      stroke(doc, C.lotStroke);
      doc.setLineDashPattern([0.8, 0.8], 0);
      drawPoly(doc, pts, "FD");
      doc.setLineDashPattern([], 0);
      // Étiquettes de longueur (en mètres réels — distance UTM)
      doc.setFontSize(4.8); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const au = ptsUtm[i], bu = ptsUtm[(i + 1) % pts.length];
        const lenM = Math.hypot(bu[0] - au[0], bu[1] - au[1]);
        if (lenM < 3) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        doc.text(`${lenM.toFixed(2)} m`.replace(".", ","), mx, my, { align: "center", baseline: "middle" });
      }
      const cx2 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy2 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text(l.code, cx2, cy2 - 0.5, { align: "center" });
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      doc.text(`${(l.areaM2 / 10000).toFixed(2)} ha`.replace(".", ","), cx2, cy2 + 2.2, { align: "center" });
    });

    // Piste d'accès centrale
    fill(doc, C.roadFill); stroke(doc, C.roadStroke); doc.setLineWidth(0.25);
    for (const v of voie) {
      if (v.length < 3) continue;
      const pts = v.map((p) => project(...(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number])));
      drawPoly(doc, pts, "FD");
    }

    // Contour parcelle (vert vif)
    stroke(doc, C.parcelGreen); doc.setLineWidth(0.9); doc.setFillColor(255, 255, 255);
    const parcPts = parcUtm.map(([x, y2]) => project(x, y2));
    drawPoly(doc, parcPts, "S");

    // Bornes A1..An
    doc.setFontSize(6); doc.setFont("helvetica", "bold");
    parcPts.forEach(([x, y2], i) => {
      fill(doc, C.borneFill); stroke(doc, C.borneStroke); doc.setLineWidth(0.3);
      doc.circle(x, y2, 1.1, "FD");
      doc.setTextColor(20, 20, 20);
      doc.text(`A${i + 1}`, x + 1.6, y2 + 2.4);
    });

    // Flèche Nord (haut-gauche)
    drawNorth(doc, planX + 10, planY + 13);

    // Échelle graphique (bas-centre)
    drawScaleBar(doc, planX + planW / 2 - 28, planY + planH - 7, scale);
  } else {
    doc.setFontSize(10); doc.setTextColor(150, 150, 150);
    doc.text("Plan indisponible (moins de 3 points).", planX + planW / 2, planY + planH / 2, { align: "center" });
  }

  // ============ COLONNE DROITE ============
  const rx = W - M - colRightW;
  let ry = top;

  // LÉGENDE
  sectionTitle(doc, rx, ry, colRightW, "LÉGENDE");
  ry += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(40, 40, 40);
  legendLine(doc, rx + 1, ry, "line", C.parcelGreen, "Limite de la parcelle"); ry += 4.5;
  legendLine(doc, rx + 1, ry, "dashed", C.lotStroke, `Limite des lots (${targetHa} ha)`); ry += 4.5;
  legendLine(doc, rx + 1, ry, "fill", C.roadFill, "Piste d'accès centrale (6 m de large)"); ry += 4.5;
  legendLine(doc, rx + 1, ry, "arrow", [240, 180, 40], "Accès principal"); ry += 4.5;
  legendLine(doc, rx + 1, ry, "point", C.borneStroke, "Point de limite (bornes)"); ry += 6;

  // TABLEAU DES LOTS
  if (lots.length > 0) {
    sectionTitle(doc, rx, ry, colRightW, `TABLEAU DES LOTS — ${targetHa} HECTARE${targetHa > 1 ? "S" : ""} CHACUN`);
    ry += 5;
    const headers = ["N° LOT", "RÉFÉRENCE OFFICIELLE", "SUPERFICIE"];
    const widths = [10, 56, 22];
    ry = drawTableRow(doc, rx, ry, widths, headers, true);
    let i = 1;
    for (const l of lots) {
      if (ry > bottom - 50) break;
      const row = [String(i), `${reference}-${l.code}`, `${(l.areaM2 / 10000).toFixed(2)} ha`.replace(".", ",")];
      ry = drawTableRow(doc, rx, ry, widths, row, false, i % 2 === 0);
      i++;
    }
    ry += 4;
  }

  // COORDONNÉES UTM
  if (m.points.length > 0 && ry < bottom - 30) {
    sectionTitle(doc, rx, ry, colRightW, `COORDONNÉES DES POINTS DE LIMITES (WGS 84 / UTM ${utmZ}${north ? "N" : "S"})`);
    ry += 5;
    const headers = ["POINT", "X (m)", "Y (m)"];
    const widths = [18, 35, 35];
    ry = drawTableRow(doc, rx, ry, widths, headers, true);
    for (let i = 0; i < m.points.length; i++) {
      if (ry > bottom - 18) break;
      const p = m.points[i];
      const [x, y2] = proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number];
      ry = drawTableRow(doc, rx, ry, widths, [`A${i + 1}`, x.toFixed(0), y2.toFixed(0)], false, i % 2 === 0);
    }
    ry += 4;
  }

  // REMARQUES IMPORTANTES (bas)
  if (ry < bottom - 8) {
    doc.setDrawColor(180, 180, 180); doc.line(rx, ry, rx + colRightW, ry); ry += 3;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); ink(doc, C.headerGreen);
    doc.text("REMARQUES IMPORTANTES", rx + colRightW / 2, ry, { align: "center" });
    ry += 3.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(40, 40, 40);
    const rem = "Ce plan est établi à partir d'un levé GPS. Le bornage contradictoire et la matérialisation physique des limites seront effectués sur le terrain avant signature des conventions.";
    const lines = doc.splitTextToSize(rem, colRightW - 2);
    doc.text(lines, rx + 1, ry);
  }

  return doc.output("blob");
}

// ----- Helpers -----
function conventionLabel(s?: string | null): string {
  if (s === "AC") return "Achat-Cession";
  if (s === "EN_COURS") return "En cours";
  if (s === "PP") return "Planté-Partagé";
  return "—";
}

function sectionTitle(doc: jsPDF, x: number, y: number, w: number, title: string) {
  fill(doc, C.sectionDark);
  doc.rect(x, y, w, 5, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text(title, x + w / 2, y + 3.4, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

function drawKVTable(doc: jsPDF, x: number, y: number, w: number, rows: [string, string][], rowH = 4.5): number {
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1);
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
  const keyW = 30;
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) { doc.setFillColor(250, 250, 248); doc.rect(x, y + i * rowH, w, rowH, "F"); }
    doc.setTextColor(80, 80, 80); doc.text(k, x + 1, y + i * rowH + rowH / 2 + 1);
    doc.setTextColor(20, 20, 20); doc.text(":", x + keyW - 1, y + i * rowH + rowH / 2 + 1);
    doc.setFont("helvetica", "bold");
    doc.text(String(v), x + keyW + 1, y + i * rowH + rowH / 2 + 1, { maxWidth: w - keyW - 2 });
    doc.setFont("helvetica", "normal");
  });
  doc.rect(x, y, w, rows.length * rowH, "S");
  return y + rows.length * rowH;
}

function drawTwoColTable(doc: jsPDF, x: number, y: number, w: number, headers: [string, string], rows: [string, string][]): number {
  const c1 = w * 0.62;
  const rowH = 5;
  // header
  fill(doc, C.tableHeader); doc.rect(x, y, w, rowH, "F");
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.15);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(20, 20, 20);
  doc.text(headers[0], x + 1.5, y + 3.4);
  doc.text(headers[1], x + c1 + 1.5, y + 3.4);
  y += rowH;
  doc.setFont("helvetica", "normal");
  rows.forEach(([a, b], i) => {
    if (i % 2 === 1) { doc.setFillColor(248, 250, 245); doc.rect(x, y, w, rowH, "F"); }
    doc.setTextColor(30, 30, 30); doc.text(a, x + 1.5, y + 3.4);
    doc.setFont("helvetica", "bold"); doc.text(b, x + c1 + 1.5, y + 3.4);
    doc.setFont("helvetica", "normal");
    y += rowH;
  });
  doc.setDrawColor(180, 180, 180); doc.rect(x, y - rows.length * rowH - rowH, w, (rows.length + 1) * rowH, "S");
  doc.line(x + c1, y - rows.length * rowH - rowH, x + c1, y);
  return y;
}

function drawTableRow(doc: jsPDF, x: number, y: number, widths: number[], cells: string[], header: boolean, alt = false): number {
  const rowH = header ? 5 : 4.4;
  const totalW = widths.reduce((a, b) => a + b, 0);
  if (header) { fill(doc, C.tableHeader); doc.rect(x, y, totalW, rowH, "F"); }
  else if (alt) { doc.setFillColor(248, 250, 245); doc.rect(x, y, totalW, rowH, "F"); }
  doc.setFont("helvetica", header ? "bold" : "normal"); doc.setFontSize(header ? 6.5 : 6.5);
  doc.setTextColor(header ? 20 : 30);
  let cx = x;
  cells.forEach((c, i) => {
    doc.text(c, cx + widths[i] / 2, y + rowH / 2 + 1.2, { align: "center" });
    cx += widths[i];
  });
  doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.1);
  doc.rect(x, y, totalW, rowH, "S");
  // vertical separators
  let vx = x;
  for (let i = 0; i < widths.length - 1; i++) { vx += widths[i]; doc.line(vx, y, vx, y + rowH); }
  return y + rowH;
}

function legendLine(doc: jsPDF, x: number, y: number, kind: "line" | "dashed" | "fill" | "point" | "arrow", color: readonly number[], label: string) {
  const c0 = color[0], c1 = color[1], c2 = color[2];
  if (kind === "line") {
    doc.setDrawColor(c0, c1, c2); doc.setLineWidth(0.7);
    doc.line(x, y - 0.5, x + 10, y - 0.5);
  } else if (kind === "dashed") {
    doc.setDrawColor(c0, c1, c2); doc.setLineWidth(0.4);
    doc.setLineDashPattern([0.8, 0.8], 0); doc.line(x, y - 0.5, x + 10, y - 0.5);
    doc.setLineDashPattern([], 0);
  } else if (kind === "fill") {
    doc.setFillColor(c0, c1, c2); doc.setDrawColor(140, 110, 70); doc.setLineWidth(0.2);
    doc.rect(x, y - 1.8, 10, 2.6, "FD");
  } else if (kind === "point") {
    doc.setFillColor(255, 255, 255); doc.setDrawColor(c0, c1, c2); doc.setLineWidth(0.4);
    doc.circle(x + 5, y - 0.5, 1, "FD");
  } else if (kind === "arrow") {
    doc.setDrawColor(c0, c1, c2); doc.setFillColor(c0, c1, c2); doc.setLineWidth(0.6);
    doc.line(x, y - 0.5, x + 8, y - 0.5);
    doc.triangle(x + 8, y - 2, x + 8, y + 1, x + 10.5, y - 0.5, "F");
  }
  doc.setTextColor(40, 40, 40); doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text(label, x + 13, y);
}

function drawNorth(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(255, 255, 255); doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
  doc.circle(x, y, 5, "FD");
  doc.setFillColor(20, 20, 20);
  doc.triangle(x, y - 4, x - 2, y + 1, x + 2, y + 1, "F");
  doc.setFillColor(180, 180, 180); doc.triangle(x, y + 4, x - 2, y - 1, x + 2, y - 1, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(20, 20, 20);
  doc.text("N", x, y - 5.6, { align: "center" });
}

function drawScaleBar(doc: jsPDF, x: number, y: number, scale: number) {
  // Choisir une longueur en mètres "ronde" qui tient en ~55mm
  const targetMm = 55;
  const targetM = targetMm / scale;
  const step = niceStep(targetM / 5);
  const ticks = 5;
  const totalMm = ticks * step * scale;
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.4); doc.setFillColor(255, 255, 255);
  for (let i = 0; i < ticks; i++) {
    const x0 = x + i * (totalMm / ticks);
    const x1 = x + (i + 1) * (totalMm / ticks);
    doc.setFillColor(i % 2 === 0 ? 20 : 255, i % 2 === 0 ? 20 : 255, i % 2 === 0 ? 20 : 255);
    doc.rect(x0, y, x1 - x0, 1.4, "FD");
  }
  doc.setFontSize(5.5); doc.setTextColor(30, 30, 30); doc.setFont("helvetica", "normal");
  for (let i = 0; i <= ticks; i++) {
    const xi = x + i * (totalMm / ticks);
    doc.text(`${(i * step).toFixed(0)}`, xi, y - 0.8, { align: "center" });
  }
  doc.text("m", x + totalMm + 2, y + 1, { baseline: "middle" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
  const denom = Math.round(1000 / scale); // mm réels par mm carte ≈ 1/scale*1000
  doc.text(`ÉCHELLE GRAPHIQUE  ·  Échelle : 1 / ${denom.toLocaleString("fr-FR")}`, x + totalMm / 2, y + 4.2, { align: "center" });
}

function drawPoly(doc: jsPDF, pts: [number, number][], style: "F" | "S" | "FD") {
  if (pts.length < 2) return;
  const lines = pts.slice(1).map(([x, y], i) => [x - pts[i][0], y - pts[i][1]] as [number, number]);
  (doc as unknown as { lines: (l: number[][], x: number, y: number, scale: number[], style: string, close: boolean) => void })
    .lines(lines, pts[0][0], pts[0][1], [1, 1], style, true);
}

function niceStep(approx: number): number {
  if (approx <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(approx)));
  const f = approx / exp;
  let nice: number;
  if (f < 1.5) nice = 1; else if (f < 3) nice = 2; else if (f < 7) nice = 5; else nice = 10;
  return nice * exp;
}

// =============================================================================
// PLAN CLIENT — Version épurée pour le souscripteur (un PDF par lot ciblé)
// Calqué sur le modèle "Plan client" : pas de cotes, pas de grille UTM,
// pas de tableau de coordonnées. Le lot du souscripteur est mis en évidence.
// =============================================================================
interface ClientArgs {
  measurement: Measurement;
  parcelle?: Parcelle | null;
  domaine?: Domaine | null;
  sp?: SP | null;
  lots?: Lot[];
  voie?: { lat: number; lng: number }[][];
  focusLotCode?: string;
  organisation?: string;
  contactInfo?: string;
}

export function buildPdfClient(args: ClientArgs): Blob {
  const {
    measurement: m, parcelle, domaine, sp, lots = [], voie = [],
    focusLotCode, organisation = "AgriCapital SARL",
    contactInfo = "AgriCapital SARL, leader en solutions agricoles intégrées. Nous transformons les terres pour votre réussite.",
  } = args;

  const doc = new jsPDF({ unit: "mm", format: "a3", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 6;

  const baseRef = parcelle && domaine && sp
    ? refOfficielle({ spCode: sp.code, domCode: domaine.code, parcCode: parcelle.code })
    : `MES-${m.id.slice(0, 8).toUpperCase()}`;
  const reference = focusLotCode ? `${baseRef}-${focusLotCode}` : baseRef;

  // ===== EN-TÊTE =====
  fill(doc, C.headerGreen);
  doc.rect(0, 0, W, 20, "F");
  try { doc.addImage(logo, "JPEG", M, 2.5, 15, 15); } catch { /* ignore */ }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(organisation.toUpperCase(), M + 18, 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Promotion Agricole & Services Intégrés", M + 18, 13);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("PLAN DE LOTISSEMENT AGRICOLE — VERSION CLIENT", W / 2, 12, { align: "center" });
  // Bandeau référence
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - M - 80, 4, 80, 12, 1.5, 1.5, "F");
  ink(doc, C.headerGreen); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(reference, W - M - 40, 11.5, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // ===== COLONNE GAUCHE (épurée) =====
  const top = 24, bottom = H - M;
  const colLW = 78;
  const lx = M;
  let ly = top;

  sectionTitle(doc, lx, ly, colLW, "APERÇU DE LA PARCELLE");
  ly += 6;
  const totalAreaHa = polygonAreaM2(m.points) / 10000;
  const normalLots = lots.filter((l) => !l.isReserve);
  const targetHa = normalLots.length > 0 ? Math.round(normalLots[0].areaM2 / 10000) || 1 : 1;
  const aperçu: [string, string][] = [
    ["Superficie totale", `${totalAreaHa.toFixed(2)} hectares`],
    ["Nombre de lots", `${normalLots.length} lots (${targetHa},00 ha chacun)`],
    ["Localisation", sp ? `${sp.name} — ${sp.departement}` : "—"],
    ["Date du plan", new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })],
  ];
  if (focusLotCode) aperçu.unshift(["Lot du souscripteur", focusLotCode]);
  ly = drawKVTable(doc, lx, ly, colLW, aperçu, 5);
  ly += 6;

  // LÉGENDE CLIENT
  sectionTitle(doc, lx, ly, colLW, "LÉGENDE CLIENT");
  ly += 7;
  doc.setFontSize(7); doc.setTextColor(40, 40, 40);
  legendLine(doc, lx + 1, ly, "line", C.parcelGreen, "Limite de Parcelle (Verte)"); ly += 5;
  legendLine(doc, lx + 1, ly, "dashed", C.lotStroke, "Limite de Lot (Pointillée)"); ly += 5;
  legendLine(doc, lx + 1, ly, "fill", C.roadFill, "Piste d'Accès Centrale"); ly += 5;
  legendLine(doc, lx + 1, ly, "point", C.borneStroke, "Accès Principal"); ly += 5;
  if (focusLotCode) {
    doc.setFillColor(180, 220, 140); doc.setDrawColor(40, 110, 30); doc.setLineWidth(0.5);
    doc.rect(lx + 1, ly - 1.8, 10, 2.6, "FD");
    doc.setFontSize(7); doc.setTextColor(40, 40, 40);
    doc.text(`Votre lot : ${focusLotCode}`, lx + 14, ly);
    ly += 7;
  }

  // INFOS ENTREPRISE (bas)
  const infoY = bottom - 26;
  fill(doc, C.headerGreen); doc.rect(lx, infoY, colLW, 5, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("INFORMATIONS ENTREPRISE", lx + colLW / 2, infoY + 3.4, { align: "center" });
  doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  const infoLines = doc.splitTextToSize(contactInfo, colLW - 2);
  doc.text(infoLines, lx + 1, infoY + 9);

  // ===== CENTRE — PLAN 2D ÉPURÉ =====
  const planX = lx + colLW + 6;
  const planY = top;
  const planW = W - planX - M;
  const planH = bottom - top;

  doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.3);
  doc.rect(planX, planY, planW, planH);
  doc.setFillColor(252, 252, 248);
  doc.rect(planX + 0.5, planY + 0.5, planW - 1, planH - 1, "F");

  if (m.points.length >= 3) {
    const utmZ = utmZone(m.points[0].lng);
    const north = m.points[0].lat >= 0;
    const projDef = `+proj=utm +zone=${utmZ} ${north ? "+north" : "+south"} +datum=WGS84 +units=m +no_defs`;
    const parcUtm = m.points.map((p) => proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);
    const allUtm: [number, number][] = [...parcUtm];
    for (const l of lots) for (const p of l.polygon) allUtm.push(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number]);
    const xs = allUtm.map((p) => p[0]), ys = allUtm.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padL = 14, padR = 14, padT = 12, padB = 14;
    const innerW = planW - padL - padR, innerH = planH - padT - padB;
    const dx = Math.max(1, maxX - minX), dy = Math.max(1, maxY - minY);
    const scale = Math.min(innerW / dx, innerH / dy);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const project = (x: number, y2: number): [number, number] => [
      planX + planW / 2 + (x - cx) * scale,
      planY + planH / 2 - (y2 - cy) * scale,
    ];

    // Lots — focus mis en évidence
    lots.forEach((l) => {
      if (l.polygon.length < 3) return;
      const pts = l.polygon.map((p) => project(...(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number])));
      const isFocus = focusLotCode && l.code === focusLotCode;
      if (isFocus) {
        doc.setFillColor(180, 220, 140);
        doc.setDrawColor(40, 110, 30);
        doc.setLineWidth(0.7);
        doc.setLineDashPattern([], 0);
      } else if (l.isReserve) {
        doc.setFillColor(248, 232, 200);
        stroke(doc, C.lotStroke);
        doc.setLineDashPattern([0.8, 0.8], 0);
        doc.setLineWidth(0.15);
      } else {
        doc.setFillColor(235, 245, 225);
        stroke(doc, C.lotStroke);
        doc.setLineDashPattern([0.8, 0.8], 0);
        doc.setLineWidth(0.15);
      }
      drawPoly(doc, pts, "FD");
      doc.setLineDashPattern([], 0);
      const cx2 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy2 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      doc.setTextColor(isFocus ? 20 : 60, isFocus ? 80 : 60, isFocus ? 20 : 60);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(l.code, cx2, cy2 - 0.5, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.text(`${(l.areaM2 / 10000).toFixed(2)} ha`.replace(".", ","), cx2, cy2 + 2.6, { align: "center" });
    });

    // Voie
    fill(doc, C.roadFill); stroke(doc, C.roadStroke); doc.setLineWidth(0.25);
    for (const v of voie) {
      if (v.length < 3) continue;
      const pts = v.map((p) => project(...(proj4("WGS84", projDef, [p.lng, p.lat]) as [number, number])));
      drawPoly(doc, pts, "FD");
    }

    // Contour parcelle
    stroke(doc, C.parcelGreen); doc.setLineWidth(1.1); doc.setFillColor(255, 255, 255);
    const parcPts = parcUtm.map(([x, y2]) => project(x, y2));
    drawPoly(doc, parcPts, "S");

    // Bornes (petits cercles seulement, sans étiquettes)
    parcPts.forEach(([x, y2]) => {
      fill(doc, C.borneFill); stroke(doc, C.borneStroke); doc.setLineWidth(0.3);
      doc.circle(x, y2, 0.9, "FD");
    });

    // Nord + échelle
    drawNorth(doc, planX + 10, planY + 13);
    drawScaleBar(doc, planX + planW - 70, planY + planH - 7, scale);
  }

  return doc.output("blob");
}

