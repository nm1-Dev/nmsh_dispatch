export type Priority = "LOW" | "MED" | "HIGH" | "PANIC";
export type CallStatus = "NEW" | "ACTIVE" | "RESOLVED" | "ARCHIVED";
export type UnitStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "RESPONDING"
  | "ON_SCENE"
  | "BUSY"
  | "OUT_OF_SERVICE";

export interface Coords {
  x: number;
  y: number;
  z?: number;
}
export interface TimelineItem {
  at: number;
  text: string;
}
export interface UnitRef {
  id: string;
  callsign?: string;
  name?: string;
  status?: UnitStatus;
  outcome?: UnitStatus;
  isGroup?: boolean;
}
export interface CallMetadata {
  panic?: boolean;
  panicAcknowledged?: boolean;
  managementStatus?: "NEW" | "ASSIGNED" | "ON_SCENE" | "HOLD";
  wave?: number;
  notes?: Array<{ at: number; text: string }>;
  timeline?: TimelineItem[];
  unitHistory?: UnitRef[];
  details?: Record<string, string>;
  [key: string]: unknown;
}
export interface DispatchCall {
  id: string;
  code: string;
  title: string;
  description: string;
  priority: Priority;
  department: string;
  coords?: Coords;
  street?: string;
  area?: string;
  createdAt: number;
  closedAt?: number;
  archivedAt?: number;
  status: CallStatus;
  assignedUnits: UnitRef[];
  respondingUnits: UnitRef[];
  dispatchedDepartments?: string[];
  metadata: CallMetadata;
}
export interface DispatchUnit {
  id: string;
  source?: number;
  callsign: string;
  name: string;
  department: string;
  rank?: string;
  job: string;
  status: UnitStatus;
  coords?: Coords;
  heading?: number;
  vehicle?: { label?: string; plate?: string; class?: string };
  movementType?: "ON_FOOT" | "SWIMMING" | "VEHICLE" | "MOTORCYCLE" | "HELICOPTER" | "AIRCRAFT" | "BOAT" | "TANK";
  radioChannel?: string;
  currentCallId?: string | null;
  isDispatcher?: boolean;
  isGroup?: boolean;
  leaderId?: string;
  memberIds?: string[];
}
export interface PatrolGroup {
  id: string;
  callsign: string;
  leaderId: string;
  memberIds: string[];
  status: UnitStatus;
  currentCallId?: string | null;
  isGroup: true;
}
export interface TacChannel {
  id: string;
  name: string;
  label?: string;
  department: string;
  status: "OPEN" | "CLOSED";
  callId?: string | null;
  memberIds: string[];
}
export interface TacticalItem {
  id: string;
  type: "MARKER" | "ZONE" | "ROUTE";
  points: Array<[number, number]>;
  createdBy: string;
  createdAt: number;
}
export interface HeatmapEvent {
  coords: Coords;
  createdAt: number;
  priority: Priority;
  type: string;
  weight?: number;
}
export interface FullDispatchState {
  calls: DispatchCall[];
  units: DispatchUnit[];
  patrolGroups: PatrolGroup[];
  tacChannels?: TacChannel[];
  tacticalItems: TacticalItem[];
  heatmapEvents: HeatmapEvent[];
  waves?: { first: number; last: number };
  service?: { department?: string; channel?: string };
  permissions?: {
    dispatcher?: boolean;
    canBecomeDispatcher?: boolean;
    history?: boolean;
    tactical?: boolean;
    heatmap?: boolean;
    tacticalOverlaysVisible?: boolean;
    forceUnitStatus?: boolean;
    joinedTacChannelId?: string | null;
  };
}

export interface HudAlert {
  id?: string;
  code?: string;
  title?: string;
  description?: string;
  priority?: Priority | number;
  department?: string;
  channel?: string;
  createdAt?: number;
  receivedAt?: number;
  responders?: UnitRef[];
  responded?: boolean;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  theme?: string;
  colors?: Record<string, string>;
}
