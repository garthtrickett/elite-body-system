import type { DeliveryModel, DeliveryProposal } from "./browser-model.ts";
export type DeliveryViewInput = Readonly<{
    state: DeliveryModel;
    propose: (p: DeliveryProposal) => void;
    outlet: HTMLElement;
    standalone?: boolean;
    signOut?: () => void;
}>;
export const formatCoachingTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
