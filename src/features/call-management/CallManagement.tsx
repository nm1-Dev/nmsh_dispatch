import { AnimatePresence, motion } from "motion/react";
import { useDroppable } from "@dnd-kit/core";
import { Clock3, Crosshair, Link2, MapPin, Radio, ShieldAlert } from "lucide-react";
import {
  formatAge,
  formatTime,
  isHistorical,
  priorityColors,
  unitLabel,
} from "../../lib/utils";
import {
  selectSelectedCall,
  selectSelectedUnit,
  useDispatchStore,
} from "../../stores/dispatch-store";
import type { DispatchCall } from "../../types/dispatch";

function managementStatus(call: DispatchCall) {
  if (call.metadata.managementStatus) return call.metadata.managementStatus;
  if (call.assignedUnits.some((unit) => unit.status === "ON_SCENE"))
    return "ON_SCENE";
  if (call.assignedUnits.length) return "ASSIGNED";
  return "NEW";
}

function AssignedUnitsDropzone({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: "assigned-units-dropzone",
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`management-assigned-dropzone ${isOver ? "is-drag-over" : ""}`}
    >
      {children}
    </div>
  );
}

export function CallManagement() {
  const call = useDispatchStore(selectSelectedCall);
  const unit = useDispatchStore(selectSelectedUnit);
  const calls = useDispatchStore((state) => state.calls);
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const configuredWaves = useDispatchStore((state) => state.waves);
  const waveRange = configuredWaves || { first: 3, last: 10 };
  const action = useDispatchStore((state) => state.dispatchAction);
  return (
    <AnimatePresence initial={false}>
      {call && (
        <motion.section
          className={`detail-panel call-management panel ${isHistorical(call) ? "is-history" : ""}`}
          aria-label="Call management"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18 }}
        >
          <div className="call-management-body">
            <section className="management-section management-call-section">
              <div className="management-call-heading">
                <span className="management-incident-icon">
                  <Radio />
                </span>
                <div className="management-title">
                  <span className="eyebrow">CALL MANAGEMENT</span>
                  <div>
                    <span className="detail-code">{call.code}</span>
                    <h2>{call.title}</h2>
                  </div>
                </div>
                <div className="management-state">
                  <span
                    className="priority-label"
                    style={
                      {
                        "--priority": priorityColors[call.priority],
                        color: priorityColors[call.priority],
                      } as React.CSSProperties
                    }
                  >
                    {call.priority}
                  </span>
                  <span className="call-status">
                    {managementStatus(call).replace("_", " ")}
                  </span>
                </div>
              </div>
              <p className="management-description">{call.description}</p>
              {call.metadata.details?.weapon && /shots?\s+fired|shooting/i.test(call.title) && (
                <div className="management-call-detail">
                  <ShieldAlert />
                  <span>Weapon reported</span>
                  <b>{call.metadata.details.weapon}</b>
                </div>
              )}
              <div className="management-call-meta">
                <span>
                  <MapPin />
                  <b>{call.street || "Location unavailable"}</b>
                  <em>{call.area}</em>
                </span>
                <span>
                  <Clock3 />
                  Opened <b>{formatAge(call.createdAt)} ago</b>
                </span>
                <span>
                  <Radio />
                  <b>
                    {(call.dispatchedDepartments || [call.department]).join(
                      " · ",
                    )}
                  </b>
                </span>
              </div>
            </section>
            <section className="management-section management-operations-section">
              <div className="management-block">
                <span className="eyebrow">STATUS</span>
                <div className="management-status-controls">
                  {(["NEW", "ASSIGNED", "ON_SCENE", "HOLD"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        className={
                          managementStatus(call) === status ? "is-active" : ""
                        }
                        disabled={!dispatcher || isHistorical(call)}
                        onClick={() =>
                          action("dispatcherSetCallManagementStatus", {
                            callId: call.id,
                            status,
                          })
                        }
                      >
                        {status.replace("_", " ")}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="management-block wave-block">
                <div className="management-label-row">
                  <span className="eyebrow">WAVE</span>
                  <b>
                    {call.metadata.wave
                      ? `WAVE ${call.metadata.wave} · THIS CALL`
                      : "NO WAVE ASSIGNED"}
                  </b>
                </div>
                <div className="wave-grid">
                  {Array.from(
                    { length: waveRange.last - waveRange.first + 1 },
                    (_, index) => waveRange.first + index,
                  ).map((wave) => {
                    const owner = calls.find(
                      (item) =>
                        item.id !== call.id &&
                        item.metadata.wave === wave &&
                        !isHistorical(item),
                    );
                    const current = call.metadata.wave === wave;
                    return (
                      <button
                        key={wave}
                        className={
                          current ? "is-current" : owner ? "is-taken" : ""
                        }
                        disabled={
                          !dispatcher || Boolean(owner) || isHistorical(call)
                        }
                        onClick={() =>
                          action("dispatcherSetCallWave", {
                            callId: call.id,
                            wave: current ? null : wave,
                          })
                        }
                      >
                        {wave}
                      </button>
                    );
                  })}
                </div>
                <div className="wave-key">
                  <span>
                    <i />
                    Free
                  </span>
                  <span>
                    <i className="taken" />
                    Taken
                  </span>
                  <span>
                    <i className="current" />
                    This call
                  </span>
                </div>
              </div>
              <div className="management-block management-assigned-section">
                <div className="management-label-row">
                  <span className="eyebrow">ASSIGNED UNITS</span>
                  <b>
                    {call.assignedUnits.length} UNIT
                    {call.assignedUnits.length === 1 ? "" : "S"}
                  </b>
                </div>
                <AssignedUnitsDropzone
                  disabled={!dispatcher || isHistorical(call)}
                >
                <div className="management-assigned-list">
                  {call.assignedUnits.length ? (
                    call.assignedUnits.map((ref) => (
                      <div className="management-unit-row" key={ref.id}>
                        <b>{unitLabel(ref)}</b>
                        <span>{ref.name}</span>
                        <em>
                          {String(ref.status || "ASSIGNED").replace("_", " ")}
                        </em>
                        {dispatcher && !isHistorical(call) && (
                          <button
                            onClick={() =>
                              action("unassign", {
                                callId: call.id,
                                unitId: ref.id,
                              })
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="management-assigned-empty">
                      No units assigned to this call.
                    </div>
                  )}
                </div>
                </AssignedUnitsDropzone>
                <button
                  className="management-wide-action"
                  disabled={
                    !dispatcher ||
                    !unit ||
                    call.assignedUnits.some((ref) => ref.id === unit.id) ||
                    isHistorical(call)
                  }
                  onClick={() =>
                    unit &&
                    action("assign", { callId: call.id, unitId: unit.id })
                  }
                >
                  <Link2 />
                  Assign selected{" "}
                  {unit && "isGroup" in unit && unit.isGroup
                    ? "patrol"
                    : "unit"}
                </button>
              </div>
            </section>
            <section className="management-section management-control-section">
              <div className="management-control-top">
                <div>
                  <span className="eyebrow">ACTIONS</span>
                  <div className="management-action-grid">
                    <button
                      disabled={!call.coords}
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("nmsh:focus-call"))
                      }
                    >
                      <Crosshair />
                      Focus
                    </button>
                  </div>
                </div>
                <div>
                  <span className="eyebrow">RESOLVE AS</span>
                  <div className="management-resolve-grid">
                    {["Cleared", "Unfounded", "No Units"].map((outcome) => (
                      <button
                        key={outcome}
                        disabled={!dispatcher || isHistorical(call)}
                        onClick={() =>
                          action("dispatcherResolveAs", {
                            callId: call.id,
                            result: outcome.toUpperCase().replace(" ", "_"),
                          })
                        }
                      >
                        {outcome}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="management-activity-block">
                <span className="eyebrow">CALL ACTIVITY</span>
                <ul className="management-timeline">
                  {(call.metadata.timeline || [])
                    .slice()
                    .reverse()
                    .map((item, index) => (
                      <li key={`${item.at}-${index}`}>
                        <time>{formatTime(item.at)}</time>
                        <span>{item.text}</span>
                      </li>
                    ))}
                </ul>
                {dispatcher && !isHistorical(call) && (
                  <div className="management-secondary-actions">
                    <button
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("nmsh:edit-call"))
                      }
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("nmsh:add-note"))
                      }
                    >
                      Add note
                    </button>
                    {call.priority === "PANIC" &&
                      !call.metadata.panicAcknowledged && (
                        <button
                          className="acknowledge-panic"
                          onClick={() =>
                            action("dispatcherAcknowledgePanic", {
                              callId: call.id,
                            })
                          }
                        >
                          Acknowledge panic
                        </button>
                      )}
                  </div>
                )}
                {isHistorical(call) && dispatcher && (
                  <button
                    className="management-wide-action"
                    onClick={() =>
                      action("dispatcherReopen", { callId: call.id })
                    }
                  >
                    Reopen call
                  </button>
                )}
              </div>
            </section>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
