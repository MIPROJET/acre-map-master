import { useEffect, useRef } from "react";
import type { Map as LMap, Polyline, Polygon, Marker, CircleMarker } from "leaflet";

export interface MapPoint { lat: number; lng: number; }

interface Props {
  center?: MapPoint;
  zoom?: number;
  perimeter?: MapPoint[];          // marked points (line + closed polygon if >=3)
  trace?: MapPoint[];               // walked path (green)
  guideTo?: MapPoint | null;        // line from last point to first (closure guide)
  guideColor?: "red" | "orange";
  current?: MapPoint | null;        // current GPS position
  currentAccuracy?: number;
  satellite?: boolean;
  schematic?: boolean;              // vue schématique (fond uni, pas de tuiles)
  lots?: { code: string; polygon: MapPoint[] }[];
  className?: string;
  onMapClick?: (p: MapPoint) => void;
}

export function MapView(props: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const layersRef = useRef<{
    perimeter?: Polygon | Polyline;
    trace?: Polyline;
    guide?: Polyline;
    cur?: CircleMarker;
    accCircle?: CircleMarker;
    pointMarkers: Marker[];
    lotLayers: (Polygon | Marker)[];
    tile?: any;
  }>({ pointMarkers: [], lotLayers: [] });

  // init
  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (!mounted || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, {
        center: [props.center?.lat ?? 6.886, props.center?.lng ?? -6.450],
        zoom: props.zoom ?? 15,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;
      addTile(map, props.satellite, props.schematic);
      bindClick(map);
      sync();
    })();
    return () => { mounted = false; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line
  }, []);

  // satellite/schematic toggle
  useEffect(() => {
    if (!mapRef.current) return;
    if (layersRef.current.tile) mapRef.current.removeLayer(layersRef.current.tile);
    addTile(mapRef.current, props.satellite, props.schematic);
  }, [props.satellite, props.schematic]);

  function addTile(map: LMap, satellite?: boolean, schematic?: boolean) {
    import("leaflet").then(({ default: L }) => {
      const group = L.layerGroup();
      // Apply / clear schematic background on the map container
      const container = map.getContainer();
      if (schematic) {
        container.style.backgroundColor = "#F5F1E8";
        container.style.backgroundImage = "linear-gradient(#e5dfce 1px, transparent 1px), linear-gradient(90deg, #e5dfce 1px, transparent 1px)";
        container.style.backgroundSize = "32px 32px";
      } else {
        container.style.backgroundImage = "";
        container.style.backgroundColor = "";
      }
      if (schematic) {
        // pas de tuiles
      } else if (satellite) {
        const google = L.tileLayer(
          "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
          { subdomains: ["0", "1", "2", "3"], maxZoom: 21, maxNativeZoom: 21,
            attribution: "Imagerie © Google", crossOrigin: true }
        );
        const esriImg = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, attribution: "Imagerie © Esri" }
        );
        const esriLabels = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, opacity: 0.85 }
        );
        google.on("tileerror", () => {
          // Si Google échoue (zones bloquées / réseau), bascule sur Esri
          if (!group.hasLayer(esriImg)) { google.remove(); esriImg.addTo(group); }
        });
        google.addTo(group);
        esriLabels.addTo(group);
      } else {
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: "© OpenStreetMap"
        }).addTo(group);
      }
      group.addTo(map);
      layersRef.current.tile = group;
      // Échelle métrique
      if (!(map as any)._acreScale) {
        L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
        (map as any)._acreScale = true;
      }
    });
  }

  function bindClick(map: LMap) {
    if (!props.onMapClick) return;
    map.on("click", (e: any) => props.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
  }

  // sync data
  useEffect(() => { sync(); /* eslint-disable-next-line */ }, [
    props.perimeter, props.trace, props.guideTo, props.current, props.lots, props.currentAccuracy, props.guideColor,
  ]);

  async function sync() {
    if (!mapRef.current) return;
    const L = (await import("leaflet")).default;
    const map = mapRef.current;
    const lr = layersRef.current;

    // clear point markers / lots
    lr.pointMarkers.forEach((m) => map.removeLayer(m));
    lr.pointMarkers = [];
    lr.lotLayers.forEach((m) => map.removeLayer(m));
    lr.lotLayers = [];
    if (lr.perimeter) { map.removeLayer(lr.perimeter); lr.perimeter = undefined; }
    if (lr.trace) { map.removeLayer(lr.trace); lr.trace = undefined; }
    if (lr.guide) { map.removeLayer(lr.guide); lr.guide = undefined; }
    if (lr.cur) { map.removeLayer(lr.cur); lr.cur = undefined; }
    if (lr.accCircle) { map.removeLayer(lr.accCircle); lr.accCircle = undefined; }

    const peri = props.perimeter ?? [];
    if (peri.length >= 3) {
      lr.perimeter = L.polygon(peri.map((p) => [p.lat, p.lng]) as any, {
        color: "#3A7A2A", weight: 3, fillColor: "#4A8F36", fillOpacity: 0.15,
      }).addTo(map);
    } else if (peri.length === 2) {
      lr.perimeter = L.polyline(peri.map((p) => [p.lat, p.lng]) as any, { color: "#3A7A2A", weight: 3 }).addTo(map);
    }
    peri.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#3A7A2A;color:white;border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        }),
      }).addTo(map);
      lr.pointMarkers.push(m);
    });

    if (props.trace && props.trace.length >= 2) {
      lr.trace = L.polyline(props.trace.map((p) => [p.lat, p.lng]) as any, {
        color: "#4CAF50", weight: 3, opacity: 0.85,
      }).addTo(map);
    }

    if (props.guideTo && peri.length >= 1) {
      const last = peri[peri.length - 1];
      const color = props.guideColor === "red" ? "#E65100" : "#E65100";
      lr.guide = L.polyline(
        [[last.lat, last.lng], [props.guideTo.lat, props.guideTo.lng]] as any,
        { color: props.guideColor === "red" ? "#D32F2F" : color, weight: 3, dashArray: "8 6" }
      ).addTo(map);
    }

    if (props.current) {
      lr.accCircle = L.circle([props.current.lat, props.current.lng], {
        radius: Math.max(props.currentAccuracy ?? 5, 2),
        color: "#2A6DB5", weight: 1, fillColor: "#2A6DB5", fillOpacity: 0.12,
      }) as any;
      (lr.accCircle as any).addTo(map);
      lr.cur = L.circleMarker([props.current.lat, props.current.lng], {
        radius: 7, color: "#fff", weight: 2, fillColor: "#2A6DB5", fillOpacity: 1,
      }).addTo(map);
    }

    for (const lot of props.lots ?? []) {
      const poly = L.polygon(lot.polygon.map((p) => [p.lat, p.lng]) as any, {
        color: "#3A7A2A", weight: 1.5, dashArray: "4 4", fillColor: "#4CAF50", fillOpacity: 0.12,
      }).addTo(map);
      lr.lotLayers.push(poly);
      const c = lot.polygon.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
      const center = { lat: c.lat / lot.polygon.length, lng: c.lng / lot.polygon.length };
      const lbl = L.marker([center.lat, center.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:white;border:1px solid #3A7A2A;color:#3A7A2A;font-weight:700;padding:2px 6px;border-radius:4px;font-size:11px">${lot.code}</div>`,
          iconSize: [40, 18], iconAnchor: [20, 9],
        }),
      }).addTo(map);
      lr.lotLayers.push(lbl);
    }

    // auto-fit
    const all: [number, number][] = [];
    peri.forEach((p) => all.push([p.lat, p.lng]));
    (props.trace ?? []).forEach((p) => all.push([p.lat, p.lng]));
    (props.lots ?? []).forEach((l) => l.polygon.forEach((p) => all.push([p.lat, p.lng])));
    if (all.length >= 2) {
      try { map.fitBounds(all as any, { padding: [30, 30], maxZoom: 19 }); } catch {}
    } else if (props.current) {
      map.setView([props.current.lat, props.current.lng], Math.max(map.getZoom(), 17));
    }
  }

  return <div ref={elRef} className={props.className ?? "h-full w-full"} />;
}
