import { useEffect } from "react";
import { isNui, nui, subscribeNui } from "../lib/nui";
import { useDispatchStore } from "../stores/dispatch-store";
import { useHudStore } from "../stores/hud-store";
import type { FullDispatchState } from "../types/dispatch";

export function useNuiBridge() {
  useEffect(
    () =>
      subscribeNui((message) => {
        const action = String(message.action || "");
        if (action === "fullDispatch") {
          useDispatchStore.getState().setOpen(message.open === true);
          if (message.state && typeof message.state === "object")
            useDispatchStore
              .getState()
              .applyState(message.state as FullDispatchState);
          return;
        }
        if (action === "fullDispatchState") {
          useDispatchStore.getState().applyState(
            (message.state || {
              calls: [],
              units: [],
              patrolGroups: [],
              tacticalItems: [],
              heatmapEvents: [],
            }) as FullDispatchState,
          );
          return;
        }
        useHudStore.getState().setMessage(message);
      }),
    [],
  );

  useEffect(() => {
    if (!isNui) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !useDispatchStore.getState().open) return;
      event.preventDefault();
      void nui.fullClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
