import { isHarryPreviewAlias } from "./contracts.ts";
import { html } from "lit-html";
import type { AuthUiState } from "./browser-model.ts";

export type AuthUiActions = Readonly<{
  setEmail: (input: Readonly<{ email: string }>) => void;
  requestLink: () => void;
  redeem: () => void;
  signOut: () => void;
}>;

const button = "sc-primary w-full";
export function authView(state: AuthUiState, actions: AuthUiActions) {
  const { mode, email, busy, busyLabel, account, message, problem } = state;
  const preview = isHarryPreviewAlias(email);
  return html`
      <div class="sc-app"><div class="sc-auth">
        <aside class="sc-auth-aside" aria-label="Elite Body System">
          <a href="/" class="sc-brand w-fit">Elite Body System</a>
          <div><p class="sc-eyebrow mb-6">Training · Nutrition · Mindset · Recovery</p>
            <p class="sc-display sc-auth-statement">Capability first.<br><em>The body follows.</em></p>
          </div>
          <p class="sc-copy mt-16 text-xs">Harry Baldwin</p>
        </aside>
        <section class="sc-auth-content">
          <a href="/" class="sc-brand w-fit lg:hidden">Elite Body System</a>
          <div class="sc-auth-form" aria-busy=${busy ? "true" : "false"}>
            <p class="sc-eyebrow mb-3">${mode === "home" ? "Your account" : "Welcome"}</p>
            <h1 class="sc-display text-[44px]">${mode === "home" ? "You’re signed in." : mode === "confirm" ? "Confirm it’s you." : "Sign in to your account."}</h1>
            ${mode === "request" ? html`
              <p class="sc-copy mt-4">${preview ? "Open Harry’s temporary preview account. No email link needed." : "Enter your email and we’ll send you a secure sign-in link. No password needed."}</p>
              <form class="mt-8 space-y-5" @submit=${(event: Event) => { event.preventDefault(); actions.requestLink(); }}>
                <div><label for="email" class="sc-label mb-2 block">Email address</label>
                  <input id="email" name="email" type=${preview ? "text" : "email"} autocomplete="email" autocapitalize="none" spellcheck="false" inputmode="email" required maxlength="254"
                    class="sc-textarea"
                    placeholder="you@example.com" .value=${email} ?disabled=${busy}
                    @input=${(event: Event) => { actions.setEmail({ email: (event.target as HTMLInputElement).value }); }}></div>
                <button class=${button} type="submit" ?disabled=${busy}>${busy ? busyLabel : preview ? "Sign in" : "Email me a sign-in link"}</button>
              </form>
              <p class="sc-copy mt-5 text-xs">${preview ? "Temporary access to Harry’s preview account." : "Use the email associated with your account. Links expire after 10 minutes."}</p>
            ` : mode === "confirm" ? html`
              ${busy ? html`<p class="sc-copy mt-5" role="status">${busyLabel}</p>` : account ? html`
                <p class="sc-copy mt-4">Continue as <strong class="font-medium text-sc-ink">${account.email}</strong>?</p>
                <button class="${button} mt-8" type="button" @click=${actions.redeem}>Continue to Elite Body System</button>` : ""}
              <a href="/sign-in" class="mt-6 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Request a new link</a>
            ` : html`
              ${account ? html`<p class="sc-copy mt-4">${account.email}</p>
                <p class="sc-copy mt-6">Welcome to Elite Body System.</p>
                <button class="${button} mt-8" type="button" ?disabled=${busy} @click=${actions.signOut}>${busy ? busyLabel : "Sign out"}</button>`
                : html`<p class="sc-copy mt-5" role="status">Loading your account…</p>`}
            `}
            <div aria-live="polite" aria-atomic="true">${message ? html`<p class="sc-auth-message" role="status">${message}</p>` : ""}</div>
            ${problem ? html`<p class="sc-error mt-6" role="alert">${problem}</p>` : ""}
          </div>
          <p class="sc-copy text-center text-xs">${preview ? "Temporary preview access" : "Secure access · Email magic link"}</p>
        </section>
      </div></div>`;
}
