import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { useDispatchStore } from "../../stores/dispatch-store";

const schema = z.object({ note: z.string().trim().min(2).max(240) });
type Values = z.infer<typeof schema>;

export function NoteModal() {
  const [open, setOpen] = useState(false);
  const selectedCallId = useDispatchStore((state) => state.selectedCallId);
  const action = useDispatchStore((state) => state.dispatchAction);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { note: "" },
  });
  useEffect(() => {
    const show = () => {
      form.reset({ note: "" });
      setOpen(true);
    };
    window.addEventListener("nmsh:add-note", show);
    return () => window.removeEventListener("nmsh:add-note", show);
  }, [form]);
  const submit = form.handleSubmit(({ note }) => {
    if (selectedCallId)
      action("dispatcherNote", { callId: selectedCallId, note });
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
            className="dispatcher-form dispatcher-note-form"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            onSubmit={submit}
          >
            <header>
              <strong>Add call note</strong>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <label>
              Note
              <textarea autoFocus {...form.register("note")} />
            </label>
            <div className="dispatcher-form-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Add note
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
