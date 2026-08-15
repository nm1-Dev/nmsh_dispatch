import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Plus, Radio, Trash2, Users } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useDispatchStore } from "../../stores/dispatch-store";
import type {
  DispatchUnit,
  PatrolGroup,
  UnitStatus,
} from "../../types/dispatch";

type Selectable =
  | DispatchUnit
  | (PatrolGroup & { name: string; department: string; job: string });

function DraggableUnitCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });
  const {
    role: _role,
    tabIndex: _tabIndex,
    "aria-disabled": _ariaDisabled,
    "aria-roledescription": _ariaRoleDescription,
    ...dragAttributes
  } = attributes;
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "is-unit-dragging" : undefined}
      {...dragAttributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

const statusColor: Record<UnitStatus, string> = {
  AVAILABLE: "#6DA07D",
  ASSIGNED: "#81909B",
  RESPONDING: "#BF9254",
  ON_SCENE: "#76AD86",
  BUSY: "#81909B",
  OUT_OF_SERVICE: "#626F79",
};

export function UnitsPanel() {
  const units = useDispatchStore((state) => state.units);
  const groups = useDispatchStore((state) => state.patrolGroups);
  const selectedId = useDispatchStore((state) => state.selectedUnitId);
  const selectedCallId = useDispatchStore((state) => state.selectedCallId);
  const selectedCall = useDispatchStore((state) => state.calls.find((call) => call.id === state.selectedCallId));
  const tacChannels = useDispatchStore((state) => state.tacChannels || []);
  const joinedTacChannelId = useDispatchStore((state) => state.joinedTacChannelId);
  const select = useDispatchStore((state) => state.selectUnit);
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const action = useDispatchStore((state) => state.dispatchAction);
  const query = useDispatchStore((state) => state.query.toLowerCase());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"UNITS" | "TAC">("UNITS");
  const [showTacForm, setShowTacForm] = useState(false);
  const [tacName, setTacName] = useState("");
  const [tacLabel, setTacLabel] = useState("");
  const roster = useMemo<Selectable[]>(() => {
    const memberIds = new Set(groups.flatMap((group) => group.memberIds));
    const groupRows = groups.map((group) => ({
      ...group,
      name: `${group.memberIds.length} officer patrol`,
      department:
        units.find((unit) => unit.id === group.leaderId)?.department || "LSPD",
      job: "patrol",
    }));
    return [
      ...groupRows,
      ...units.filter((unit) => !memberIds.has(unit.id)),
    ].filter(
      (unit) =>
        !query ||
        `${unit.callsign} ${unit.name} ${unit.status}`
          .toLowerCase()
          .includes(query),
    );
  }, [units, groups, query]);
  const isDispatch = (unit: Selectable) =>
    Boolean(
      ("isDispatcher" in unit && unit.isDispatcher) ||
        (unit.isGroup &&
          (unit.memberIds || []).some(
            (id) => units.find((item) => item.id === id)?.isDispatcher,
          )),
    );
  const sections: Array<[string, (unit: Selectable) => boolean]> = [
    ["DISPATCH", isDispatch],
    ["AVAILABLE", (unit) => !isDispatch(unit) && unit.status === "AVAILABLE"],
    [
      "ASSIGNED",
      (unit) =>
        !isDispatch(unit) &&
        (unit.status === "ASSIGNED" || unit.status === "BUSY"),
    ],
    ["RESPONDING", (unit) => !isDispatch(unit) && unit.status === "RESPONDING"],
    ["ON SCENE", (unit) => !isDispatch(unit) && unit.status === "ON_SCENE"],
    [
      "OUT OF SERVICE",
      (unit) => !isDispatch(unit) && unit.status === "OUT_OF_SERVICE",
    ],
  ];
  const summary = [
    "AVAILABLE",
    "ASSIGNED",
    "RESPONDING",
    "ON_SCENE",
  ] as UnitStatus[];
  return (
    <aside className="units-panel panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">FIELD OPERATIONS</span>
          <h2>Units</h2>
        </div>
        <div className="unit-heading-actions">
          {dispatcher && (
            <button
              className="patrol-create"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("nmsh:create-patrol"))
              }
            >
              Create patrol
            </button>
          )}
          <span className="panel-count">{roster.length}</span>
        </div>
      </div>
      <div className="operations-tabs">
        <button className={view === "UNITS" ? "is-active" : ""} onClick={() => setView("UNITS")}>Units</button>
        <button className={view === "TAC" ? "is-active" : ""} onClick={() => setView("TAC")}>TAC <span>{tacChannels.length}</span></button>
      </div>
      {view === "UNITS" ? <div className="operations-view">
        <div className="unit-summary">
          {summary.map((status) => (
            <div className="summary-item" key={status}>
              <b>{units.filter((unit) => unit.status === status).length}</b>
              {status.replace("_", " ")}
            </div>
          ))}
        </div>
        <div className="unit-list">
          <AnimatePresence initial={false}>
            {sections.map(([label, match]) => {
              const rows = roster.filter(match);
              return (
                <section
                  className={`unit-state-section ${rows.length ? "" : "is-empty"}`}
                  key={label}
                >
                  <header>
                    <span>{label}</span>
                    <b>{rows.length}</b>
                  </header>
                  {rows.map((unit) => {
                    const selected = selectedId === unit.id;
                    const members = unit.isGroup
                      ? ((unit.memberIds || [])
                          .map((id) => units.find((item) => item.id === id))
                          .filter(Boolean) as DispatchUnit[])
                      : [];
                    const open = expanded.has(unit.id);
                    const unitRank = unit.isGroup
                      ? `${members.length} officers`
                      : unit.rank || "Officer";
                    return (
                      <DraggableUnitCard
                        key={unit.id}
                        id={unit.id}
                        disabled={!dispatcher || unit.status !== "AVAILABLE"}
                      >
                      <motion.div
                        layout
                        className={unit.isGroup ? "patrol-group" : ""}
                      >
                        <div
                          className={unit.isGroup ? "patrol-card-row" : undefined}
                        >
                          <button
                            className={`unit-card ${unit.isGroup ? "patrol-card" : ""} ${selected ? "is-selected" : ""}`}
                            style={
                              {
                                "--status-color": statusColor[unit.status],
                              } as React.CSSProperties
                            }
                            onClick={() => select(selected ? null : unit.id)}
                          >
                          <div className="unit-top">
                            <span
                              className={`unit-badge ${unit.isGroup ? "patrol-badge" : ""}`}
                            >
                              {unit.callsign}
                            </span>
                            <div className="unit-info">
                              <strong>{unit.name}</strong>
                              <span>
                                {unit.department} •{" "}
                                {unitRank}
                              </span>
                            </div>
                            {isDispatch(unit) ? (
                              <span className="dispatcher-badge">
                                Dispatcher
                              </span>
                            ) : (
                              <span className="status-pill">
                                {unit.status.replace("_", " ")}
                              </span>
                            )}
                            {selected && (
                              <span className="selection-check">✓</span>
                            )}
                          </div>
                          </button>
                          {unit.isGroup && (
                            <button
                              type="button"
                              className="patrol-toggle"
                              aria-label={open ? "Collapse patrol" : "Expand patrol"}
                              aria-expanded={open}
                              onClick={() => {
                                setExpanded((current) => {
                                  const next = new Set(current);
                                  next.has(unit.id)
                                    ? next.delete(unit.id)
                                    : next.add(unit.id);
                                  return next;
                                });
                              }}
                            >
                              <ChevronRight className={open ? "rotate-90" : ""} />
                            </button>
                          )}
                        </div>
                        <AnimatePresence initial={false}>
                          {unit.isGroup && open && (
                            <motion.div
                              key={`${unit.id}-members`}
                              className="patrol-members"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                            >
                            {members.map((member) => (
                              <div className="patrol-member" key={member.id}>
                                <div>
                                  <strong>
                                    {member.callsign} · {member.name}
                                    {member.id === unit.leaderId && (
                                      <b className="leader-tag">LEADER</b>
                                    )}
                                  </strong>
                                  <small>
                                    {member.status.replace("_", " ")}
                                  </small>
                                </div>
                                {dispatcher && (
                                  <button
                                    onClick={() =>
                                      useDispatchStore
                                        .getState()
                                        .dispatchAction("patrolRemoveMember", {
                                          groupId: unit.id,
                                          unitId: member.id,
                                        })
                                    }
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                            {dispatcher && (
                              <button
                                className="patrol-disband"
                                onClick={() =>
                                  useDispatchStore
                                    .getState()
                                    .dispatchAction("patrolDisband", {
                                      groupId: unit.id,
                                    })
                                }
                              >
                                Disband patrol
                              </button>
                            )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                      </DraggableUnitCard>
                    );
                  })}
                </section>
              );
            })}
          </AnimatePresence>
        </div>
      </div> : <div className="operations-view">
        <div className="tac-summary">
          <span><i className="tac-live-dot" /> Open channels</span><b>{tacChannels.length}</b>
        </div>
        <div className="tac-list">
          {tacChannels.map((channel) => {
            const linkedCall = channel.callId ? useDispatchStore.getState().calls.find((call) => call.id === channel.callId) : undefined;
            return <article className="tac-channel" key={channel.id}>
              <div className="tac-channel-head">
                <span className="tac-channel-badge">{channel.name}</span>
                <span className="tac-channel-info"><strong>{channel.label}</strong><span>{linkedCall ? `${linkedCall.code} · ${linkedCall.title}` : "No call assigned"}</span></span>
                <span className="tac-status">{channel.status}</span>
                <Radio />
              </div>
              <div className="tac-channel-body">
                <div className="tac-member-heading"><span>Members</span><b>{channel.memberIds.length}</b></div>
                <div className="tac-members">{channel.memberIds.length ? channel.memberIds.map((id) => {
                  const member = units.find((unit) => unit.id === id) || groups.find((group) => group.id === id);
                  return <div className="tac-member" key={id}><span><strong>{member?.callsign || id}</strong><span>{member?.isGroup ? "Patrol" : "Unit"}</span></span>{dispatcher && <button title="Remove member" onClick={() => action("tacRemoveTarget", { channelId: channel.id, unitId: id })}><Trash2 /></button>}</div>
                }) : <div className="tac-empty">No members assigned.</div>}</div>
                <div className="tac-actions">
                  <button className={joinedTacChannelId === channel.id ? "is-joined" : ""} onClick={() => action(joinedTacChannelId === channel.id ? "tacLeave" : "tacJoin", joinedTacChannelId === channel.id ? {} : { channelId: channel.id })}>{joinedTacChannelId === channel.id ? "Leave" : "Join"}</button>
                  {dispatcher && <button disabled={!selectedId} onClick={() => selectedId && action("tacAssignTarget", { channelId: channel.id, unitId: selectedId })}>Assign selected</button>}
                  {dispatcher && <button disabled={!selectedCallId} onClick={() => selectedCallId && action("tacAssignCall", { channelId: channel.id, callId: selectedCallId })}>Assign call</button>}
                  {dispatcher && <button className="is-danger" onClick={() => action("tacClose", { channelId: channel.id })}>Close</button>}
                </div>
              </div>
            </article>;
          })}
          {!tacChannels.length && <div className="tac-empty">No open TAC channels.</div>}
          {dispatcher && (
            <div className="tac-create-actions">
              <button type="button" onClick={() => setShowTacForm((open) => !open)}>
                <Plus /> {showTacForm ? "Cancel" : "Create TAC"}
              </button>
            </div>
          )}
          {dispatcher && showTacForm && (
            <form
              className="tac-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!tacName.trim() || !tacLabel.trim()) return;
                action("tacCreate", { channel: { name: tacName.trim(), label: tacLabel.trim() } });
                setTacName("");
                setTacLabel("");
                setShowTacForm(false);
              }}
            >
              <label>
                <span>TAC name</span>
                <input value={tacName} maxLength={16} placeholder="e.g. TAC 1" onChange={(event) => setTacName(event.target.value)} />
              </label>
              <label>
                <span>Channel label</span>
                <input value={tacLabel} maxLength={64} placeholder="e.g. Downtown operations" onChange={(event) => setTacLabel(event.target.value)} />
              </label>
              <button type="submit" disabled={!tacName.trim() || !tacLabel.trim()}>Create TAC</button>
            </form>
          )}
        </div>
      </div>}
    </aside>
  );
}
