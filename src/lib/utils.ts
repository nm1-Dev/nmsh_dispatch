import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DispatchCall, Priority } from "../types/dispatch";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const priorityColors: Record<Priority, string> = {
  LOW: "#818E98",
  MED: "#BF9254",
  HIGH: "#BD6265",
  PANIC: "#DC6269",
};
export const formatAge = (timestamp?: number) => {
  const seconds = Math.max(
    0,
    Math.floor(Date.now() / 1000 - Number(timestamp || 0)),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};
export const formatTime = (timestamp?: number) =>
  new Date(Number(timestamp || 0) * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
export const isHistorical = (call: DispatchCall) =>
  call.status === "RESOLVED" || call.status === "ARCHIVED";
export const unitLabel = (unit: { callsign?: string; name?: string }) =>
  unit.callsign || unit.name || "UNIT";
