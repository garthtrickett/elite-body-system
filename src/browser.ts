import { mountAuth } from "./features/auth/browser.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) mountAuth(root);
