import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin, Radio, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { priorityColors } from "../../lib/utils";
import { useDispatchStore } from "../../stores/dispatch-store";
import type { Coords, TacticalItem } from "../../types/dispatch";
import { incidentSvg } from "../../components/IncidentIcon";

const unitMovementSvg = (movementType?: string) => {
  const paths: Record<string, string> = {
    ON_FOOT: '<circle cx="12" cy="5" r="2"/><path d="m10 21 1-7-3 2-2-3M11 8l3 3 3-1M14 11l-1 5 4 5"/>',
    SWIMMING: '<circle cx="8" cy="6" r="2"/><path d="m10 9 3 2 3-1M3 16c1.2-1 2.8-1 4 0s2.8 1 4 0 2.8-1 4 0 2.8 1 4 0M3 20c1.2-1 2.8-1 4 0s2.8 1 4 0 2.8-1 4 0 2.8 1 4 0"/>',
    VEHICLE: '<path d="m5 16-1.5-1.5V11l2-5h13l2 5v3.5L19 16M5 16h14v3H5Z"/><circle cx="7" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    MOTORCYCLE: '<path d="M5 17h4l3-7h4l3 7M9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 10 10 7h4"/>',
    HELICOPTER: '<path d="M4 12h12a4 4 0 0 1 4 4v1H9a5 5 0 0 1-5-5ZM12 12V7M8 7h8M17 17v3M4 20h15"/>',
    AIRCRAFT: '<path d="m22 16-6-2-4-9-2 9-6 2v2l6-1 2 4 2-4 6 1Z"/>',
    BOAT: '<path d="M3 15h18l-2 4H5ZM8 15V9h8l2 6M5 22c1.2-1 2.8-1 4 0s2.8 1 4 0 2.8-1 4 0"/>',
    TANK: '<path d="M4 14h15l2 3v3H5l-2-3ZM11 14V9h7l2 5M15 9V6h6"/><circle cx="8" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[movementType || "ON_FOOT"] || paths.ON_FOOT}</svg>`;
};

const crs = Object.assign({}, L.CRS.Simple, {
  projection: L.Projection.LonLat,
  scale: (zoom: number) => 2 ** zoom,
  zoom: (scale: number) => Math.log(scale) / Math.LN2,
  distance: (a: L.LatLng, b: L.LatLng) =>
    Math.hypot(b.lng - a.lng, b.lat - a.lat),
  transformation: new L.Transformation(0.02072, 117.3, -0.0205, 172.8),
  infinite: true,
});
const bounds = L.latLngBounds([-4058, -5659], [8429, 6682]);
const point = (coords: Coords) => L.latLng(coords.y, coords.x);
const tacticalStyle = (item: TacticalItem) =>
  item.type === "ZONE"
    ? "#BD6265"
    : item.type === "ROUTE"
      ? "#7DA2BB"
      : "#BF9254";

export function DispatchMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const calls = useDispatchStore((state) => state.calls);
  const units = useDispatchStore((state) => state.units);
  const tactical = useDispatchStore((state) => state.tacticalItems);
  const heat = useDispatchStore((state) => state.heatmapEvents);
  const selectedCallId = useDispatchStore((state) => state.selectedCallId);
  const selectedUnitId = useDispatchStore((state) => state.selectedUnitId);
  const selectCall = useDispatchStore((state) => state.selectCall);
  const selectUnit = useDispatchStore((state) => state.selectUnit);
  const heatVisible = useDispatchStore((state) => state.heatmapVisible);
  const setHeatVisible = useDispatchStore((state) => state.setHeatmapVisible);
  const heatAvailable = useDispatchStore((state) => state.heatmapAvailable);
  const tacticalVisible = useDispatchStore((state) => state.tacticalVisible);
  const setTacticalVisible = useDispatchStore(
    (state) => state.setTacticalVisible,
  );
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const action = useDispatchStore((state) => state.dispatchAction);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tool, setTool] = useState<TacticalItem["type"] | null>(null);
  const [draft, setDraft] = useState<Array<[number, number]>>([]);
  const [heatRange, setHeatRange] = useState<"30M" | "1H" | "6H" | "24H">(
    "24H",
  );
  const [heatPriority, setHeatPriority] = useState("ALL");
  const [heatType, setHeatType] = useState("ALL");
  const filteredHeat = useMemo(() => {
    const seconds = { "30M": 1800, "1H": 3600, "6H": 21600, "24H": 86400 }[
        heatRange
      ],
      now = Math.floor(Date.now() / 1000);
    return heat
      .filter((event) => now - event.createdAt <= seconds)
      .filter(
        (event) => heatPriority === "ALL" || event.priority === heatPriority,
      )
      .filter((event) => heatType === "ALL" || event.type === heatType);
  }, [heat, heatRange, heatPriority, heatType]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = L.map(container.current, {
      crs,
      minZoom: 3,
      maxZoom: 5,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 100,
      zoomControl: false,
      attributionControl: false,
      maxBounds: bounds,
      maxBoundsViscosity: 1,
    }).setView([-850, 100], 3);
    L.tileLayer("assets/maps/styleAtlas/{z}/{x}/{y}.jpg", {
      minZoom: 3,
      maxZoom: 5,
      noWrap: true,
      bounds,
    }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize(false));
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current,
      layer = overlayRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    calls
      .filter(
        (call) =>
          call.coords &&
          call.status !== "ARCHIVED" &&
          call.status !== "RESOLVED",
      )
      .forEach((call) => {
        const icon = L.divIcon({
          className: "dispatch-leaflet-icon",
          html: `<span class="leaflet-call-marker" style="--marker:${priorityColors[call.priority]}">${incidentSvg(call.title, call.code)}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker(point(call.coords!), {
          icon,
          zIndexOffset: call.id === selectedCallId ? 1000 : 0,
        })
          .on("click", () => selectCall(call.id))
          .addTo(layer);
      });
    units
      .filter((unit) => unit.coords)
      .forEach((unit) => {
        const icon = L.divIcon({
          className: "dispatch-leaflet-icon",
          html: `<span class="leaflet-unit-marker movement-${(unit.movementType || "ON_FOOT").toLowerCase()}">${unitMovementSvg(unit.movementType)}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker(point(unit.coords!), { icon })
          .on("click", () => selectUnit(unit.id))
          .addTo(layer);
      });
    if (tacticalVisible)
      tactical.forEach((item) => {
        const points = item.points.map(([lat, lng]) => L.latLng(lat, lng));
        const color = tacticalStyle(item);
        const shape =
          item.type === "MARKER"
            ? L.circleMarker(points[0], {
                radius: 7,
                color,
                fillColor: color,
                fillOpacity: 0.35,
              })
            : item.type === "ZONE"
              ? L.polygon(points, { color, fillOpacity: 0.08, weight: 2 })
              : L.polyline(points, { color, weight: 3, dashArray: "8 5" });
        shape
          .bindTooltip(`${item.type} · ${item.createdBy}`, {
            className: "tactical-tooltip",
          })
          .addTo(layer);
      });
    if (heatVisible)
      filteredHeat.forEach((event) =>
        L.circle(point(event.coords), {
          radius: 140 + (event.weight || 1) * 80,
          stroke: false,
          fillColor: priorityColors[event.priority],
          fillOpacity: 0.13,
        }).addTo(layer),
      );
    if (draft.length) {
      const points = draft.map(([lat, lng]) => L.latLng(lat, lng));
      (tool === "ZONE"
        ? L.polygon(points, {
            color: "#BF9254",
            dashArray: "6 4",
            fillOpacity: 0.06,
          })
        : tool === "ROUTE"
          ? L.polyline(points, { color: "#7DA2BB", dashArray: "6 4" })
          : L.circleMarker(points[0], { radius: 7, color: "#BF9254" })
      ).addTo(layer);
    }
  }, [
    calls,
    units,
    tactical,
    filteredHeat,
    tacticalVisible,
    heatVisible,
    selectedCallId,
    selectCall,
    selectUnit,
    draft,
    tool,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tool) return;
    const click = (event: L.LeafletMouseEvent) => {
      const value: [number, number] = [event.latlng.lat, event.latlng.lng];
      if (tool === "MARKER") {
        action("tacticalCreate", { item: { type: tool, points: [value] } });
        setTool(null);
        setDraft([]);
      } else setDraft((current) => [...current, value]);
    };
    map.on("click", click);
    return () => {
      map.off("click", click);
    };
  }, [tool, action]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const call = calls.find((item) => item.id === selectedCallId);
    const unit = units.find((item) => item.id === selectedUnitId);
    const coords = call?.coords || unit?.coords;
    if (coords) map.setView(point(coords), 4, { animate: true });
  }, [selectedCallId, selectedUnitId, calls, units]);

  const selected = calls.find((call) => call.id === selectedCallId);
  useEffect(() => {
    const focus = () => {
      if (selected?.coords)
        mapRef.current?.setView(point(selected.coords), 4, { animate: true });
    };
    window.addEventListener("nmsh:focus-call", focus);
    return () => window.removeEventListener("nmsh:focus-call", focus);
  }, [selected]);
  const toggleTactical = () => {
    const next = !tacticalVisible;
    setTacticalVisible(next);
    action("tacticalVisibility", { visible: next });
  };
  const finishDraft = () => {
    if (tool && draft.length >= (tool === "ZONE" ? 3 : 2))
      action("tacticalCreate", { item: { type: tool, points: draft } });
    setTool(null);
    setDraft([]);
  };
  return (
    <section className="map-panel panel">
      <div className="map-toolbar">
        <div>
          <span className="eyebrow">LIVE OPERATIONS</span>
          <strong>Los Santos</strong>
        </div>
        <div className="map-tools">
          <button
            title="Center selected call"
            disabled={!selected?.coords}
            onClick={() =>
              selected?.coords &&
              mapRef.current?.setView(point(selected.coords), 4)
            }
          >
            <Crosshair />
          </button>
          {heatAvailable && (
            <button
              className={heatVisible ? "is-active" : ""}
              title="Toggle activity heatmap"
              onClick={() => setHeatVisible(!heatVisible)}
            >
              <Radio />
            </button>
          )}
          <button
            className={tacticalVisible ? "is-active" : ""}
            title="Toggle tactical overlays"
            onClick={toggleTactical}
          >
            <MapPin />
          </button>
          {dispatcher && (
            <button
              className={toolsOpen ? "is-active" : ""}
              title="Tactical map tools"
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <Crosshair />
            </button>
          )}
          <span>LIVE MAP</span>
        </div>
      </div>
      <div className={`map-stage ${heatVisible ? "is-heatmap-active" : ""}`}>
        <div ref={container} id="leaflet-map" />
        {toolsOpen && (
          <div className="tactical-toolbar">
            <div className="tactical-toolbar-head">
              <span>Tactical tools</span>
              <b>
                {tool ? `${tool} · ${draft.length} POINTS` : "SHARED OVERLAYS"}
              </b>
            </div>
            <div className="tactical-tool-grid">
              <button
                className={tool === "MARKER" ? "is-active" : ""}
                onClick={() => {
                  setTool("MARKER");
                  setDraft([]);
                }}
              >
                <MapPin />
                Marker
              </button>
              <button
                className={tool === "ZONE" ? "is-active" : ""}
                onClick={() => {
                  setTool("ZONE");
                  setDraft([]);
                }}
              >
                <Crosshair />
                Perimeter
              </button>
              <button
                className={tool === "ROUTE" ? "is-active" : ""}
                onClick={() => {
                  setTool("ROUTE");
                  setDraft([]);
                }}
              >
                <Radio />
                Roadblock
              </button>
            </div>
            <div className="tactical-draw-actions">
              <button
                disabled={!tool || draft.length < (tool === "ZONE" ? 3 : 2)}
                onClick={finishDraft}
              >
                Finish
              </button>
              <button
                disabled={!tool}
                onClick={() => {
                  setTool(null);
                  setDraft([]);
                }}
              >
                Cancel
              </button>
              <button
                className="is-danger"
                onClick={() => action("tacticalClear")}
              >
                <Trash2 />
                Clear
              </button>
            </div>
          </div>
        )}
        {heatVisible && (
          <section className="heatmap-control">
            <header>
              <span>ACTIVITY HEATMAP</span>
              <b>{filteredHeat.length} INCIDENTS</b>
            </header>
            <div className="heatmap-ranges">
              {(["30M", "1H", "6H", "24H"] as const).map((range) => (
                <button
                  key={range}
                  className={heatRange === range ? "is-active" : ""}
                  onClick={() => setHeatRange(range)}
                >
                  {range.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="heatmap-filters">
              <label>
                Incident
                <select
                  value={heatType}
                  onChange={(event) => setHeatType(event.target.value)}
                >
                  <option value="ALL">All incidents</option>
                  <option value="ROBBERY">Robbery</option>
                  <option value="VIOLENCE">Violence</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="VEHICLE">Vehicle</option>
                </select>
              </label>
              <label>
                Priority
                <select
                  value={heatPriority}
                  onChange={(event) => setHeatPriority(event.target.value)}
                >
                  <option value="ALL">All priorities</option>
                  <option>LOW</option>
                  <option>MED</option>
                  <option>HIGH</option>
                  <option>PANIC</option>
                </select>
              </label>
            </div>
          </section>
        )}
        {tacticalVisible && (
          <aside className="tactical-items">
            <header>
              <span>TACTICAL OVERLAYS</span>
              <b>{tactical.length}</b>
            </header>
            <div className="tactical-item-list">
              {tactical.map((item) => (
                <div className="tactical-item" key={item.id}>
                  <span
                    className="tactical-item-icon"
                    style={
                      {
                        "--tactical": tacticalStyle(item),
                      } as React.CSSProperties
                    }
                  >
                    <MapPin />
                  </span>
                  <span className="tactical-item-info">
                    <strong>
                      {item.type === "ZONE"
                        ? "Search perimeter"
                        : item.type === "ROUTE"
                          ? "Roadblock route"
                          : "Shared marker"}
                    </strong>
                    <span>Created by {item.createdBy}</span>
                  </span>
                  {dispatcher && (
                    <span className="tactical-item-actions">
                      <button
                        onClick={() =>
                          action("tacticalDelete", { itemId: item.id })
                        }
                      >
                        <Trash2 />
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}
        <div className="map-legend">
          <span>
            <i className="dot panic" /> Panic
          </span>
          <span>
            <i className="dot high" /> High
          </span>
          <span>
            <i className="dot med" /> Med
          </span>
          <span>
            <i className="unit-dot" /> Unit
          </span>
        </div>
        <div className="map-scale">500 M</div>
      </div>
    </section>
  );
}
