import type { ClientProfile, ProfileSnapshot, ClientResult } from "../profile/browser.ts";
import type { ClientState, StoredDay } from "./client-data.ts";
import type { Scorecard } from "./operations.ts";

export type SyncEffect = Readonly<{ id: number }> & (
  | Readonly<{ kind: "load" }>
  | Readonly<{ kind: "saveDay"; date: string; revision: number; scorecard: Scorecard; generation: number }>
  | Readonly<{ kind: "saveProfile"; revision: number; profile: ClientProfile }>
);
export type SyncProposal =
  | Readonly<{ kind: "clientLoaded"; id: number; result: ClientResult<ClientState> }>
  | Readonly<{ kind: "daySaved"; id: number; result: ClientResult<StoredDay> }>
  | Readonly<{ kind: "profileSaved"; id: number; result: ClientResult<ProfileSnapshot> }>
  | Readonly<{ kind: "syncFailed"; id: number }>;
