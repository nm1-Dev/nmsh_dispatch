import {
  CarFront,
  Cross,
  House,
  Landmark,
  Radio,
  ShieldAlert,
  Store,
} from "lucide-react";

export function incidentKind(title = "", code = "") {
  const value = `${title} ${code}`.toLowerCase();
  if (/medical|ambulance|injur|unconscious/.test(value)) return "medical";
  if (/bank|fleeca|pacific|paleto/.test(value)) return "bank";
  if (/store|shop|robbery/.test(value)) return "store";
  if (/house|burglary|home/.test(value)) return "house";
  if (/vehicle|car|boost/.test(value)) return "vehicle";
  if (/panic|officer down/.test(value)) return "panic";
  return "radio";
}

export function IncidentIcon({
  title,
  code,
}: {
  title?: string;
  code?: string;
}) {
  const kind = incidentKind(title, code);
  const Icon =
    kind === "medical"
      ? Cross
      : kind === "bank"
        ? Landmark
        : kind === "store"
          ? Store
          : kind === "house"
            ? House
            : kind === "vehicle"
              ? CarFront
              : kind === "panic"
                ? ShieldAlert
                : Radio;
  return <Icon aria-hidden="true" />;
}

export function incidentSvg(title?: string, code?: string) {
  const kind = incidentKind(title, code);
  const paths: Record<string, string> = {
    medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
    bank: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16M3 21h18"/>',
    store:
      '<path d="M4 10v10h16V10M3 4h18l-1 6a3 3 0 0 1-4 2 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-4-2Z"/>',
    house: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
    vehicle: '<path d="m5 16-1.5-1.5V11l2-5h13l2 5v3.5L19 16M5 16h14v3H5Z"/>',
    panic:
      '<path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/>',
    radio:
      '<path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0M11 15a2 2 0 0 1 2 0"/><circle cx="12" cy="18" r="1"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]}</svg>`;
}
