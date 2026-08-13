import {
  ChevronLeft,
  ChevronRight,
  Info,
  Move,
  RotateCcw,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isNui, nui } from "../../lib/nui";
import { formatAge } from "../../lib/utils";
import { useHudStore } from "../../stores/hud-store";
import type { HudAlert } from "../../types/dispatch";
import { IncidentIcon } from "../../components/IncidentIcon";

const previewAlert: HudAlert = {
  id: "preview",
  code: "10-13",
  title: "Shots Fired",
  description: "Multiple gunshots reported near Strawberry Ave, Strawberry.",
  priority: "HIGH",
  department: "LSPD",
  channel: "DISPATCH",
  createdAt: Math.floor(Date.now() / 1000) - 8,
  responders: [{ id: "101" }],
  details: { gender: "Male", street: "Strawberry Ave", weapon: "Handgun" },
};
const detailLabels: Record<string, string> = {
  name: "Name",
  phone: "Number",
  incident: "Incident",
  street: "Location",
  gender: "Gender",
  weapon: "Weapon",
  vehicle: "Vehicle",
  plate: "Plate",
  color: "Color",
  class: "Class",
  doors: "Doors",
  direction: "Direction",
};

export function SmallHud() {
  const store = useHudStore();
  const alert = store.alert || (!isNui ? previewAlert : undefined);
  const visible = store.visible || !isNui;
  const cursor =
    store.cursor ||
    (!isNui && new URLSearchParams(location.search).get("edit") === "1");
  const [moving, setMoving] = useState(false);
  const [position, setPosition] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("nmsh_dispatch_position") || "null",
        ) || { right: 22, top: 28 }
      );
    } catch {
      return { right: 22, top: 28 };
    }
  });
  const drag = useRef<{
    x: number;
    y: number;
    right: number;
    top: number;
  } | null>(null);
  const priority = alert?.priority || "LOW";
  const priorityClass =
    priority === "PANIC" || priority === "HIGH" || priority === 1
      ? "priority-1"
      : priority === "MED" || priority === 2
        ? "priority-2"
        : "priority-3";
  const details = useMemo(
    () =>
      Object.entries(alert?.details || {}).filter(
        ([key, value]) =>
          detailLabels[key] &&
          value !== undefined &&
          value !== null &&
          String(value).trim(),
      ),
    [alert],
  );
  const respond = () => {
    if (isNui) void nui.respond();
    else if (alert)
      useHudStore.setState({
        visible: true,
        alert: { ...alert, responded: true },
      });
  };
  const clear = () => {
    if (isNui) void nui.clearAlerts();
    else useHudStore.setState({ visible: true, empty: true, alert: undefined });
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!visible) return;
      if (event.key === "ArrowLeft") void nui.previous();
      if (event.key === "ArrowRight") void nui.next();
      if (event.key.toLowerCase() === store.respondKey.toLowerCase()) respond();
      if (event.key === "Escape" && cursor) void nui.closeFocus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [visible, cursor, store.respondKey]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      setPosition({
        right: Math.max(
          8,
          drag.current.right - (event.clientX - drag.current.x),
        ),
        top: Math.max(8, drag.current.top + (event.clientY - drag.current.y)),
      });
    };
    const up = () => {
      if (drag.current)
        localStorage.setItem(
          "nmsh_dispatch_position",
          JSON.stringify(position),
        );
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [position]);

  if (!visible) return null;
  return (
    <div
      className="hud-positioner"
      style={{ right: position.right, top: position.top }}
    >
      {cursor && (
        <nav className="edit-toolbar" aria-label="Dispatch panel editing tools">
          <button
            className={`edit-tool ${store.details ? "is-active" : ""}`}
            onClick={store.toggleDetails}
            title="Details"
          >
            <Info />
          </button>
          <button
            className={`edit-tool ${moving ? "is-active" : ""}`}
            onClick={() => setMoving(!moving)}
            title="Move"
          >
            <Move />
          </button>
          <button
            className="edit-tool"
            onClick={() => {
              const reset = { right: 22, top: 28 };
              setPosition(reset);
              localStorage.setItem(
                "nmsh_dispatch_position",
                JSON.stringify(reset),
              );
            }}
            title="Reset"
          >
            <RotateCcw />
          </button>
        </nav>
      )}
      <motion.section
        key={alert?.id || (store.empty ? "empty" : "alert")}
        className={`dispatch-card ${priorityClass} ${priority === "PANIC" ? "is-panic-arrival" : "is-normal-arrival"} ${store.empty ? "is-empty" : ""} ${alert?.responded ? "is-responding" : ""} ${(alert?.responders?.length || 0) > 0 ? "has-responders" : ""} ${cursor ? "is-cursor-active" : ""} ${store.details && details.length ? "is-expanded" : ""}`}
        data-priority={priority}
        aria-live="polite"
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        onPointerDown={(event) => {
          if (!moving) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            right: position.right,
            top: position.top,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
      >
        <div className="priority-edge" />
        <header className="dispatch-header">
          <div className="header-left">
            <span className="alert-count status-badge">
              {store.empty ? "0" : `${store.index || 1}/${store.total || 1}`}
            </span>
            <span className="department-label">
              <span className="brand-mark" />
              <span>{alert?.department || store.department}</span>
              <b>•</b>
              <span>{alert?.channel || store.channel}</span>
            </span>
          </div>
          <div className="header-right">
            <div className="normal-status">
              <time>
                {alert?.createdAt ? `${formatAge(alert.createdAt)} ago` : ""}
              </time>
              {cursor && (
                <button className="clear-alerts" onClick={clear}>
                  CLEAR
                </button>
              )}
              {!store.empty && (
                <span className="priority-badge">{priority}</span>
              )}
            </div>
          </div>
        </header>
        <main className="alert-content">
          {store.empty ? (
            <>
              <div className="call-heading">
                <h1>No active alerts</h1>
              </div>
              <p className="call-description">
                There are currently no active alerts.
              </p>
            </>
          ) : (
            <>
              <div className="call-heading">
                <span className="call-type-icon">
                  <IncidentIcon title={alert?.title} code={alert?.code} />
                </span>
                {(alert?.responders?.length || 0) > 0 && (
                  <span className="unit-response status-badge">
                    <Users />
                    <span>{alert?.responders?.length}</span>
                  </span>
                )}
                <span className="call-code">{alert?.code}</span>
                <span className="heading-divider">•</span>
                <h1>{alert?.title}</h1>
              </div>
              <p className="call-description">{alert?.description}</p>
              {store.details && details.length > 0 && (
                <section className="alert-details">
                  <div className="details-inner">
                    <div className="details-heading">
                      <span className="section-marker" />
                      <span>CALL DETAILS</span>
                      <span className="details-rule" />
                    </div>
                    <dl className="details-grid">
                      {details.map(([key, value]) => (
                        <div className="detail-row" key={key}>
                          <span className="detail-icon" aria-hidden="true">
                            <Info />
                          </span>
                          <dt>{detailLabels[key]}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
        <footer className="dispatch-controls">
          <button
            className="control control-previous"
            disabled={store.index <= 1 || store.empty}
            onClick={() => void nui.previous()}
          >
            <span className="control-icon">
              <ChevronLeft />
            </span>
            <span>Previous</span>
          </button>
          <button
            className="control control-respond"
            disabled={store.empty}
            onClick={respond}
          >
            <kbd>{store.respondKey}</kbd>
            <span>{alert?.responded ? "Unit responding" : "Respond"}</span>
          </button>
          <button
            className="control control-next"
            disabled={store.index >= store.total || store.empty}
            onClick={() => void nui.next()}
          >
            <span>Next</span>
            <span className="control-icon">
              <ChevronRight />
            </span>
          </button>
        </footer>
      </motion.section>
    </div>
  );
}
