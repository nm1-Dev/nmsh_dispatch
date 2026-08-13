import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { MapPin } from "lucide-react";
import { formatAge, isHistorical, priorityColors } from "../../lib/utils";
import { useDispatchStore } from "../../stores/dispatch-store";
import type { DispatchCall, Priority } from "../../types/dispatch";
import { HistoryTable } from "../history/HistoryTable";

function CallCard({ call }: { call: DispatchCall }) {
  const selected = useDispatchStore(
    (state) => state.selectedCallId === call.id,
  );
  const select = useDispatchStore((state) => state.selectCall);
  const priority = call.priority;
  return (
    <motion.button
      layout
      className={`call-card ${isHistorical(call) ? "is-history" : ""} ${selected ? "is-selected" : ""}`}
      data-status={call.status}
      aria-pressed={selected}
      style={{ "--priority": priorityColors[priority] } as React.CSSProperties}
      onClick={() => select(selected ? null : call.id)}
    >
      <div className="call-top">
        <span className="priority-label">{priority}</span>
        <span className="call-code">{call.code}</span>
        {isHistorical(call) && (
          <span className="history-status-pill">{call.status}</span>
        )}
        <span className="call-age">
          {formatAge(call.archivedAt || call.closedAt || call.createdAt)}
        </span>
        {selected && <span className="selection-check">✓</span>}
      </div>
      <h3>{call.title}</h3>
      <p>
        {[call.street, call.area].filter(Boolean).join(", ") ||
          "Location unavailable"}
      </p>
      <div className="call-meta">
        <MapPin />
        <span>{call.department}</span>
        <span className="assigned-count">
          {call.assignedUnits.length} unit
          {call.assignedUnits.length === 1 ? "" : "s"}
        </span>
      </div>
    </motion.button>
  );
}

function VirtualCalls({ calls }: { calls: DispatchCall[] }) {
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: calls.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 108,
    enabled: calls.length > 20,
  });
  if (calls.length <= 20)
    return (
      <div className="call-list">
        <AnimatePresence initial={false}>
          {calls.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
        </AnimatePresence>
      </div>
    );
  return (
    <div ref={parent} className="call-list">
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            key={row.key}
            style={{
              position: "absolute",
              width: "100%",
              transform: `translateY(${row.start}px)`,
            }}
          >
            <CallCard call={calls[row.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CallsPanel() {
  const calls = useDispatchStore((state) => state.calls);
  const view = useDispatchStore((state) => state.callView);
  const setView = useDispatchStore((state) => state.setCallView);
  const filter = useDispatchStore((state) => state.priorityFilter);
  const setFilter = useDispatchStore((state) => state.setPriorityFilter);
  const query = useDispatchStore((state) => state.query.toLowerCase());
  const historyAvailable = useDispatchStore((state) => state.historyAvailable);
  const department = useDispatchStore((state) => state.service?.department);
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [historyRange, setHistoryRange] = useState("ALL");
  const visible = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const seconds =
      historyRange === "24H"
        ? 86400
        : historyRange === "7D"
          ? 604800
          : historyRange === "30D"
            ? 2592000
            : Infinity;
    return calls
      .filter((call) => !department || call.department === department)
      .filter((call) =>
        view === "HISTORY" ? isHistorical(call) : !isHistorical(call),
      )
      .filter((call) => filter === "ALL" || call.priority === filter)
      .filter(
        (call) =>
          view !== "HISTORY" ||
          historyStatus === "ALL" ||
          call.status === historyStatus,
      )
      .filter(
        (call) =>
          view !== "HISTORY" ||
          now - (call.archivedAt || call.closedAt || call.createdAt) <= seconds,
      )
      .filter(
        (call) =>
          !query ||
          `${call.code} ${call.title} ${call.street} ${call.area}`
            .toLowerCase()
            .includes(query),
      );
  }, [calls, view, filter, query, department, historyStatus, historyRange]);
  return (
    <aside className="calls-panel panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INCIDENT RECORDS</span>
          <h2>{view === "HISTORY" ? "Call History" : "Active Calls"}</h2>
        </div>
        <span className="panel-count">{visible.length}</span>
      </div>
      {historyAvailable && (
        <div className="operations-tabs call-view-tabs">
          <button
            className={view === "ACTIVE" ? "is-active" : ""}
            onClick={() => setView("ACTIVE")}
          >
            Active
          </button>
          <button
            className={view === "HISTORY" ? "is-active" : ""}
            onClick={() => setView("HISTORY")}
          >
            History <span>{calls.filter(isHistorical).length}</span>
          </button>
        </div>
      )}
      <div className="filter-block">
        <div className="filter-row">
          {(["ALL", "LOW", "MED", "HIGH", "PANIC"] as const).map((value) => (
            <button
              key={value}
              className={`filter ${value.toLowerCase()} ${filter === value ? "is-active" : ""}`}
              onClick={() => setFilter(value as Priority | "ALL")}
            >
              {value}
            </button>
          ))}
        </div>
        {view === "HISTORY" && (
          <div className="history-inline-filters">
            <select
              value={historyStatus}
              onChange={(event) => setHistoryStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              value={historyRange}
              onChange={(event) => setHistoryRange(event.target.value)}
            >
              <option value="ALL">All time</option>
              <option value="24H">24 hours</option>
              <option value="7D">7 days</option>
              <option value="30D">30 days</option>
            </select>
          </div>
        )}
      </div>
      {view === "HISTORY" ? (
        <HistoryTable calls={visible} />
      ) : visible.length ? (
        <VirtualCalls calls={visible} />
      ) : (
        <div className="empty-state">
          No active calls match the selected filters.
        </div>
      )}
    </aside>
  );
}
