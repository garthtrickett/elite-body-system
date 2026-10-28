import type { Entry } from "../checkins/index.ts";
import type { ProgramAdjustment } from "../training/index.ts";
export type Membership = Readonly<{
    level: "group" | "individual";
    active: boolean;
    revision: number;
}>;
export type ClientCard = Readonly<{
    id: string;
    name: string;
    email: string;
    membership: Membership | null;
    profileCompleted: boolean;
    lastCheckin: string | null;
    pendingCheckins: number;
    unread: number;
}>;
export type Roster = Readonly<{
    clients: readonly ClientCard[];
    nextCursor: string | null;
    canManageMembership: boolean;
}>;
export type Message = Readonly<{
    id: string;
    body: string;
    author: string;
    fromMentor: boolean;
    own: boolean;
    createdAt: string;
}>;
export type Thread = Readonly<{
    messages: readonly Message[];
    nextCursor: string | null;
}>;
export type WorkoutSummary = Readonly<{
    date: string;
    finished: boolean;
    sets: number;
    volume: number;
}>;
export type ClientDetail = Readonly<{
    client: ClientCard;
    goals: string;
    equipment: string;
    limitations: string;
    timezone: string;
    checkins: readonly Entry[];
    nextCheckinCursor: string | null;
    workouts: readonly WorkoutSummary[];
    adjustments: readonly ProgramAdjustment[];
    thread: Thread;
}>;
export type MemberRoom = Readonly<{
    membership: Membership | null;
    thread: Thread;
    adjustments: readonly ProgramAdjustment[];
    coachingName: string;
}>;
