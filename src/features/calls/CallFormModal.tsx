import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isNui, nui } from "../../lib/nui";
import {
  selectSelectedCall,
  useDispatchStore,
} from "../../stores/dispatch-store";
import type { DispatchCall, Priority } from "../../types/dispatch";
import { Button } from "../../components/ui/button";

const schema = z.object({
  code: z.string().min(2).max(16),
  title: z.string().min(3).max(80),
  description: z.string().min(3).max(300),
  priority: z.enum(["LOW", "MED", "HIGH", "PANIC"]),
  department: z.string().min(2).max(20),
  street: z.string().max(80),
  area: z.string().max(80),
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
});
type Values = z.infer<typeof schema>;

export function CallFormModal() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const selected = useDispatchStore(selectSelectedCall);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: "10-00",
      title: "",
      description: "",
      priority: "MED",
      department: "LSPD",
      street: "",
      area: "",
      x: 0,
      y: 0,
      z: 0,
    },
  });
  useEffect(() => {
    const create = () => {
      setEditing(false);
      form.reset({
        code: "10-00",
        title: "",
        description: "",
        priority: "MED",
        department: "LSPD",
        street: "",
        area: "",
        x: 0,
        y: 0,
        z: 0,
      });
      setOpen(true);
    };
    const edit = () => {
      if (!selected) return;
      setEditing(true);
      form.reset({
        code: selected.code,
        title: selected.title,
        description: selected.description,
        priority: selected.priority,
        department: selected.department,
        street: selected.street || "",
        area: selected.area || "",
        x: selected.coords?.x || 0,
        y: selected.coords?.y || 0,
        z: selected.coords?.z || 0,
      });
      setOpen(true);
    };
    window.addEventListener("nmsh:create-call", create);
    window.addEventListener("nmsh:edit-call", edit);
    return () => {
      window.removeEventListener("nmsh:create-call", create);
      window.removeEventListener("nmsh:edit-call", edit);
    };
  }, [form, selected]);
  const submit = form.handleSubmit((values) => {
    const payload = {
      ...values,
      coords: { x: values.x, y: values.y, z: values.z || 0 },
    };
    if (isNui)
      void nui.action(
        editing
          ? { action: "dispatcherEdit", callId: selected?.id, updates: payload }
          : { action: "dispatcherCreate", call: payload },
      );
    else {
      const state = useDispatchStore.getState();
      const now = Math.floor(Date.now() / 1000);
      if (editing && selected)
        useDispatchStore.setState({
          calls: state.calls.map((call) =>
            call.id === selected.id
              ? { ...call, ...payload, priority: values.priority as Priority }
              : call,
          ),
        });
      else {
        const call: DispatchCall = {
          id: `preview-${Date.now()}`,
          code: values.code,
          title: values.title,
          description: values.description,
          priority: values.priority,
          department: values.department,
          street: values.street,
          area: values.area,
          coords: payload.coords,
          createdAt: now,
          status: "NEW",
          assignedUnits: [],
          respondingUnits: [],
          metadata: { timeline: [{ at: now, text: "Call created" }] },
        };
        useDispatchStore.setState({
          calls: [call, ...state.calls],
          selectedCallId: call.id,
        });
      }
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
          role="dialog"
          aria-modal="true"
        >
          <motion.form
            className="dispatcher-form"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.18 }}
            onSubmit={submit}
          >
            <header>
              <strong>{editing ? "Edit call" : "Create call"}</strong>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="dispatcher-form-grid">
              <label>
                Code
                <input {...form.register("code")} />
              </label>
              <label>
                Title
                <input {...form.register("title")} />
              </label>
              <label className="wide">
                Description
                <textarea {...form.register("description")} />
              </label>
              <label>
                Priority
                <select {...form.register("priority")}>
                  <option>LOW</option>
                  <option>MED</option>
                  <option>HIGH</option>
                  <option>PANIC</option>
                </select>
              </label>
              <label>
                Department
                <input {...form.register("department")} />
              </label>
              <label>
                Street
                <input {...form.register("street")} />
              </label>
              <label>
                Area
                <input {...form.register("area")} />
              </label>
              <label>
                X<input type="number" step="any" {...form.register("x")} />
              </label>
              <label>
                Y<input type="number" step="any" {...form.register("y")} />
              </label>
              <label>
                Z<input type="number" step="any" {...form.register("z")} />
              </label>
            </div>
            <div className="dispatcher-form-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save call
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
