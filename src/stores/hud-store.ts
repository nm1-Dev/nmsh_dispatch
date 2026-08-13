import { create } from "zustand";
import type { HudAlert } from "../types/dispatch";

interface HudStore {
  visible: boolean;
  empty: boolean;
  alert?: HudAlert;
  index: number;
  total: number;
  respondKey: string;
  cursor: boolean;
  details: boolean;
  department: string;
  channel: string;
  setMessage: (message: Record<string, unknown>) => void;
  toggleDetails: () => void;
}
export const useHudStore = create<HudStore>((set) => ({
  visible: false,
  empty: false,
  index: 0,
  total: 0,
  respondKey: "G",
  cursor: false,
  details: false,
  department: "LSPD",
  channel: "DISPATCH",
  toggleDetails: () => set((state) => ({ details: !state.details })),
  setMessage: (message) => {
    const action = String(message.action || "");
    if (action === "hide")
      return set({ visible: false, alert: undefined, empty: false });
    if (action === "cursor") return set({ cursor: message.active === true });
    if (action === "respondKey")
      return set({ respondKey: String(message.key || "—") });
    if (action === "empty")
      return set({
        visible: true,
        empty: true,
        alert: undefined,
        index: 0,
        total: 0,
        department: String(message.department || "LSPD"),
        channel: String(message.channel || "DISPATCH"),
        respondKey: String(message.respondKey || "G"),
      });
    if (message.alert && typeof message.alert === "object")
      set({
        visible: true,
        empty: false,
        alert: message.alert as HudAlert,
        index: Number(message.index || 1),
        total: Number(message.total || 1),
        respondKey: String(message.respondKey || "G"),
      });
  },
}));
