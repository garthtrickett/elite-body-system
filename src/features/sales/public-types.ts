import type { SalesSettings } from "./contracts.ts";
import type { PublicModel, PublicProposal } from "./public-model.ts";
export type PublicViewInput = Readonly<{
    state: PublicModel;
    settings: SalesSettings;
    propose: (proposal: PublicProposal) => void;
}>;
