export const isNui =
  typeof window !== "undefined" &&
  typeof (window as Window & { GetParentResourceName?: () => string })
    .GetParentResourceName === "function";

type NuiListener = (message: Record<string, unknown>) => void;
const listeners = new Set<NuiListener>();
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    listeners.forEach((listener) =>
      listener(message as Record<string, unknown>),
    );
  });
}

export function subscribeNui(listener: NuiListener) {
  ensureListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function postNui<T = unknown>(
  endpoint: string,
  data: Record<string, unknown> = {},
): Promise<T | undefined> {
  if (!isNui) return undefined;
  const resource = (
    window as unknown as Window & { GetParentResourceName: () => string }
  ).GetParentResourceName();
  const response = await fetch(`https://${resource}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(data),
  });
  return response.json().catch(() => undefined) as Promise<T | undefined>;
}

export const nui = {
  previous: () => postNui("previous"),
  next: () => postNui("next"),
  respond: () => postNui("respond"),
  closeFocus: () => postNui("closeFocus"),
  clearAlerts: () => postNui("clearAlerts"),
  fullReady: () => postNui("fullDispatchReady"),
  fullClose: () => postNui("fullDispatchClose"),
  action: (payload: Record<string, unknown>) =>
    postNui("fullDispatchAction", payload),
};
