import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { isNui, nui } from "../../lib/nui";
import { useDispatchStore } from "../../stores/dispatch-store";

const schema = z.object({
  callsign: z.string().min(2).max(16),
  leaderId: z.string().min(1),
  memberIds: z.array(z.string()).min(1),
});
type Values = z.infer<typeof schema>;
export function PatrolFormModal() {
  const [open, setOpen] = useState(false);
  const allUnits = useDispatchStore((s) => s.units);
  const units = useMemo(
    () => allUnits.filter((unit) => unit.status === "AVAILABLE"),
    [allUnits],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { callsign: "ADAM-2", leaderId: "", memberIds: [] },
  });
  useEffect(() => {
    const handler = () => {
      form.reset({
        callsign: "ADAM-2",
        leaderId: units[0]?.id || "",
        memberIds: units.slice(0, 2).map((unit) => unit.id),
      });
      setOpen(true);
    };
    window.addEventListener("nmsh:create-patrol", handler);
    return () => window.removeEventListener("nmsh:create-patrol", handler);
  }, [form, units]);
  const submit = form.handleSubmit((values) => {
    if (isNui) void nui.action({ action: "patrolCreate", patrol: values });
    else {
      const state = useDispatchStore.getState();
      useDispatchStore.setState({
        patrolGroups: [
          ...state.patrolGroups,
          {
            id: `patrol-${Date.now()}`,
            callsign: values.callsign,
            leaderId: values.leaderId,
            memberIds: values.memberIds,
            status: "AVAILABLE",
            isGroup: true,
          },
        ],
      });
    }
    setOpen(false);
  });
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dispatcher-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.form
            className="dispatcher-form patrol-form"
            initial={{ scale: 0.98, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            onSubmit={submit}
          >
            <header>
              <strong>Create patrol group</strong>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="dispatcher-form-grid">
              <label className="wide">
                Callsign
                <input {...form.register("callsign")} />
              </label>
              <label className="wide">
                Leader
                <select {...form.register("leaderId")}>
                  {units.map((unit) => (
                    <option value={unit.id} key={unit.id}>
                      {unit.callsign} · {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="wide">
                <legend>Members</legend>
                {units.map((unit) => (
                  <label className="patrol-member-option" key={unit.id}>
                    <input
                      type="checkbox"
                      value={unit.id}
                      {...form.register("memberIds")}
                    />
                    <span>
                      {unit.callsign} · {unit.name}
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="dispatcher-form-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create patrol
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
