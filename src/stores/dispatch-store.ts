import { create } from "zustand";
import { isNui, nui } from "../lib/nui";
import { mockState } from "../lib/mock-data";
import type {
  DispatchCall,
  DispatchUnit,
  FullDispatchState,
  PatrolGroup,
  Priority,
  TacticalItem,
} from "../types/dispatch";

type CallView = "ACTIVE" | "HISTORY";
interface DispatchStore extends FullDispatchState {
  open: boolean;
  dispatcher: boolean;
  canBecomeDispatcher: boolean;
  historyAvailable: boolean;
  tacticalPermission: boolean;
  heatmapAvailable: boolean;
  joinedTacChannelId: string | null;
  selectedCallId: string | null;
  selectedUnitId: string | null;
  callView: CallView;
  priorityFilter: Priority | "ALL";
  query: string;
  heatmapVisible: boolean;
  tacticalVisible: boolean;
  rolePreview: "dispatcher" | "officer";
  applyState: (state: FullDispatchState) => void;
  setOpen: (open: boolean) => void;
  selectCall: (id: string | null) => void;
  selectUnit: (id: string | null) => void;
  setCallView: (view: CallView) => void;
  setPriorityFilter: (priority: Priority | "ALL") => void;
  setQuery: (query: string) => void;
  toggleDispatcher: () => void;
  setHeatmapVisible: (value: boolean) => void;
  setTacticalVisible: (value: boolean) => void;
  dispatchAction: (action: string, data?: Record<string, unknown>) => void;
}

const role =
  new URLSearchParams(location.search).get("role") === "officer"
    ? "officer"
    : "dispatcher";
const emptyState = (): FullDispatchState => ({
  calls: [],
  units: [],
  patrolGroups: [],
  tacChannels: [],
  tacticalItems: [],
  heatmapEvents: [],
  waves: { first: 3, last: 10 },
  permissions: {},
});
// Browser previews deliberately use fixtures. FiveM starts from an empty state
// and renders only after the server sends fullDispatchState.
const initial = isNui ? emptyState() : mockState(role === "dispatcher");
export const useDispatchStore = create<DispatchStore>((set, get) => ({
  ...initial,
  open: !isNui && location.pathname.endsWith("full-dispatch.html"),
  dispatcher: initial.permissions?.dispatcher === true,
  canBecomeDispatcher: initial.permissions?.canBecomeDispatcher === true,
  historyAvailable: initial.permissions?.history === true,
  tacticalPermission: initial.permissions?.tactical === true,
  heatmapAvailable: initial.permissions?.heatmap === true,
  joinedTacChannelId: initial.permissions?.joinedTacChannelId || null,
  selectedCallId: null,
  selectedUnitId: null,
  callView: "ACTIVE",
  priorityFilter: "ALL",
  query: "",
  heatmapVisible: false,
  tacticalVisible: true,
  rolePreview: role,
  applyState: (state) =>
    set({
      ...state,
      dispatcher: state.permissions?.dispatcher === true,
      canBecomeDispatcher: state.permissions?.canBecomeDispatcher === true,
      historyAvailable: state.permissions?.history === true,
      tacticalPermission: state.permissions?.tactical === true,
      heatmapAvailable: state.permissions?.heatmap === true,
      joinedTacChannelId: state.permissions?.joinedTacChannelId || null,
      tacticalVisible: state.permissions?.tacticalOverlaysVisible !== false,
    }),
  setOpen: (open) =>
    set({
      open,
      selectedCallId: open ? null : get().selectedCallId,
      selectedUnitId: open ? null : get().selectedUnitId,
    }),
  selectCall: (selectedCallId) => set({ selectedCallId }),
  selectUnit: (selectedUnitId) => set({ selectedUnitId }),
  setCallView: (callView) => set({ callView, selectedCallId: null }),
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setQuery: (query) => set({ query }),
  setHeatmapVisible: (heatmapVisible) => set({ heatmapVisible }),
  setTacticalVisible: (tacticalVisible) => set({ tacticalVisible }),
  toggleDispatcher: () => {
    const joining = !get().dispatcher;
    if (isNui) {
      void nui.action({ action: "setDispatcherSession", enabled: joining });
      return;
    }
    const units = get().units.map((unit, index) =>
      index === 0 ? { ...unit, isDispatcher: joining } : unit,
    );
    set({
      dispatcher: joining,
      historyAvailable: joining,
      tacticalPermission: joining,
      units,
    });
  },
  dispatchAction: (action, data = {}) => {
    if (isNui) {
      void nui.action({ action, ...data });
      return;
    }
    const state = get();
    const callId = String(data.callId || state.selectedCallId || "");
    const unitId = String(data.unitId || state.selectedUnitId || "");
    if (action === "assign" && callId && unitId) {
      set({
        calls: state.calls.map((call) =>
          call.id === callId &&
          !call.assignedUnits.some((unit) => unit.id === unitId)
            ? {
                ...call,
                assignedUnits: [
                  ...call.assignedUnits,
                  {
                    id: unitId,
                    ...state.units.find((unit) => unit.id === unitId),
                    status: "ASSIGNED",
                  },
                ],
              }
            : call,
        ),
        units: state.units.map((unit) =>
          unit.id === unitId
            ? { ...unit, status: "ASSIGNED", currentCallId: callId }
            : unit,
        ),
      });
    } else if (action === "unassign" && callId && unitId) {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                assignedUnits: call.assignedUnits.filter(
                  (unit) => unit.id !== unitId,
                ),
                respondingUnits: call.respondingUnits.filter(
                  (unit) => unit.id !== unitId,
                ),
              }
            : call,
        ),
        units: state.units.map((unit) =>
          unit.id === unitId
            ? { ...unit, status: "AVAILABLE", currentCallId: null }
            : unit,
        ),
      });
    } else if (
      action === "dispatcherResolve" ||
      action === "dispatcherResolveAs"
    ) {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                status: "RESOLVED",
                closedAt: Math.floor(Date.now() / 1000),
              }
            : call,
        ),
        selectedCallId: null,
      });
    } else if (action === "dispatcherReopen") {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                status: "ACTIVE",
                closedAt: undefined,
                archivedAt: undefined,
              }
            : call,
        ),
        callView: "ACTIVE",
      });
    } else if (action === "dispatcherPriority") {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? { ...call, priority: data.priority as Priority }
            : call,
        ),
      });
    } else if (action === "dispatcherSetCallManagementStatus") {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                metadata: {
                  ...call.metadata,
                  managementStatus:
                    data.status === "HOLD" ? "HOLD" : undefined,
                },
              }
            : call,
        ),
      });
    } else if (action === "dispatcherSetCallWave") {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                metadata: {
                  ...call.metadata,
                  wave: typeof data.wave === "number" ? data.wave : undefined,
                },
              }
            : call,
        ),
      });
    } else if (action === "dispatcherAcknowledgePanic") {
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                metadata: { ...call.metadata, panicAcknowledged: true },
              }
            : call,
        ),
      });
    } else if (action === "dispatcherNote") {
      const at = Math.floor(Date.now() / 1000),
        note = String(data.note || "");
      set({
        calls: state.calls.map((call) =>
          call.id === callId
            ? {
                ...call,
                metadata: {
                  ...call.metadata,
                  notes: [...(call.metadata.notes || []), { at, text: note }],
                  timeline: [
                    ...(call.metadata.timeline || []),
                    { at, text: note },
                  ],
                },
              }
            : call,
        ),
      });
    } else if (action === "patrolDisband") {
      const group = state.patrolGroups.find((item) => item.id === data.groupId);
      const memberIds = new Set(group?.memberIds || []);
      set({
        patrolGroups: state.patrolGroups.filter(
          (group) => group.id !== data.groupId,
        ),
        units: state.units.map((unit) =>
          memberIds.has(unit.id)
            ? { ...unit, status: "AVAILABLE", currentCallId: null }
            : unit,
        ),
        selectedUnitId:
          state.selectedUnitId === data.groupId ? null : state.selectedUnitId,
      });
    } else if (
      action === "tacticalCreate" &&
      data.item &&
      typeof data.item === "object"
    ) {
      set({
        tacticalItems: [
          ...state.tacticalItems,
          {
            ...(data.item as TacticalItem),
            id: `tactical-${Date.now()}`,
            createdAt: Math.floor(Date.now() / 1000),
            createdBy: "DISPATCH PREVIEW",
          },
        ],
      });
    } else if (action === "tacticalDelete")
      set({
        tacticalItems: state.tacticalItems.filter(
          (item) => item.id !== data.itemId,
        ),
      });
    else if (action === "tacticalClear") set({ tacticalItems: [] });
    else if (action === "tacCreate") {
      const channel = data.channel as { name?: string; label?: string } | undefined;
      if (!channel?.name || !channel.label) return;
      set({
        tacChannels: [
          ...(state.tacChannels || []),
          {
            id: `tac-${Date.now()}`,
            name: channel.name.toUpperCase(),
            label: channel.label,
            department: state.service?.department || "LSPD",
            status: "OPEN",
            memberIds: [],
          },
        ],
      });
    } else if (action === "tacClose") {
      set({
        tacChannels: (state.tacChannels || []).filter(
          (channel) => channel.id !== data.channelId,
        ),
      });
    } else if (
      action === "tacAssignCall" ||
      action === "tacAssignTarget" ||
      action === "tacRemoveTarget"
    ) {
      set({
        tacChannels: (state.tacChannels || []).map((channel) => {
          if (channel.id !== data.channelId) return channel;
          if (action === "tacAssignCall") return { ...channel, callId: callId || null };
          const memberIds = new Set(channel.memberIds || []);
          if (action === "tacAssignTarget") memberIds.add(unitId);
          else memberIds.delete(unitId);
          return { ...channel, memberIds: [...memberIds] };
        }),
      });
    } else if (action === "tacJoin") {
      set({ joinedTacChannelId: String(data.channelId || "") || null });
    } else if (action === "tacLeave") {
      set({ joinedTacChannelId: null });
    }
  },
}));

export const selectCalls = (state: DispatchStore) => state.calls;
export const selectUnits = (state: DispatchStore) => state.units;
export const selectSelectedCall = (
  state: DispatchStore,
): DispatchCall | undefined =>
  state.calls.find((call) => call.id === state.selectedCallId);
export const selectSelectedUnit = (
  state: DispatchStore,
): DispatchUnit | PatrolGroup | undefined =>
  state.units.find((unit) => unit.id === state.selectedUnitId) ||
  state.patrolGroups.find((group) => group.id === state.selectedUnitId);
export const selectTacticalItems = (state: DispatchStore): TacticalItem[] =>
  state.tacticalItems;
