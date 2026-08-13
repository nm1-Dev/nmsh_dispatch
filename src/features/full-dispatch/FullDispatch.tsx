import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { isNui, nui } from "../../lib/nui";
import { useDispatchStore } from "../../stores/dispatch-store";
import { CallManagement } from "../call-management/CallManagement";
import { NoteModal } from "../call-management/NoteModal";
import { CallFormModal } from "../calls/CallFormModal";
import { CallsPanel } from "../calls/CallsPanel";
import { DispatchHeader } from "../dispatcher/DispatchHeader";
import { DispatchMap } from "../map/DispatchMap";
import { PatrolFormModal } from "../patrols/PatrolFormModal";
import { UnitsPanel } from "../units/UnitsPanel";

export function FullDispatch() {
  const open = useDispatchStore((state) => state.open);
  const selected = useDispatchStore((state) => state.selectedCallId);
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const calls = useDispatchStore((state) => state.calls);
  const action = useDispatchStore((state) => state.dispatchAction);
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  useEffect(() => {
    if (open) void nui.fullReady();
  }, [open]);
  const selectedCall = calls.find((call) => call.id === selected);
  const canAssign = Boolean(
    dispatcher && selectedCall && selectedCall.status !== "RESOLVED" && selectedCall.status !== "ARCHIVED",
  );
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      if (isNui) void nui.fullClose();
      else useDispatchStore.getState().setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="full-dispatch-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DndContext
            sensors={sensors}
            onDragStart={({ active }) => setDraggedUnitId(String(active.id))}
            onDragCancel={() => setDraggedUnitId(null)}
            onDragEnd={({ active, over }) => {
              setDraggedUnitId(null);
              if (!canAssign || over?.id !== "assigned-units-dropzone") return;
              action("assign", { callId: selectedCall!.id, unitId: String(active.id) });
            }}
          >
          <motion.main
            className="dispatch-shell"
            initial={{ opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.995 }}
            transition={{ duration: 0.18 }}
          >
            <DispatchHeader />
            <section
              className={`workspace ${selected ? "has-call-selection" : ""}`}
            >
              <CallsPanel />
              <DispatchMap />
              <UnitsPanel />
              <CallManagement />
            </section>
            <CallFormModal />
            <PatrolFormModal />
            <NoteModal />
          </motion.main>
          <DragOverlay dropAnimation={null}>
            {draggedUnitId && (
              <div className="unit-drag-overlay">
                {draggedUnitId}
              </div>
            )}
          </DragOverlay>
          </DndContext>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
