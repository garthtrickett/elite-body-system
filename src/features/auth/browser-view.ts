import { html } from "lit-html";
import type { AuthUiState } from "./browser-model.ts";

export type AuthUiActions = Readonly<{
  setEmail: (input: Readonly<{ email: string }>) => void;
  requestLink: () => void;
  redeem: () => void;
  signOut: () => void;
}>;

const button = "w-full rounded-xl bg-emerald-950 px-5 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60";
export function authView(state: AuthUiState, actions: AuthUiActions) {
  const { mode, email, busy, busyLabel, account, message, problem } = state;
  return html`
      <div class="min-h-dvh lg:grid lg:grid-cols-2">
        <aside class="relative hidden flex-col justify-between overflow-hidden bg-emerald-950 p-12 text-stone-100 lg:flex xl:p-16" aria-label="Elite Body System">
          <a href="/" class="w-fit text-sm font-semibold tracking-[0.18em] focus-visible:outline-2 focus-visible:outline-offset-4">ELITE BODY SYSTEM</a>
          <div aria-hidden="true" class="my-16 grid h-52 grid-cols-5 items-end gap-4 opacity-70">
            <div class="h-1/4 rounded-t-full bg-emerald-800"></div><div class="h-2/4 rounded-t-full bg-emerald-700"></div>
            <div class="h-3/4 rounded-t-full bg-emerald-600"></div><div class="h-full rounded-t-full bg-lime-200"></div>
            <div class="h-3/4 rounded-t-full bg-emerald-800"></div>
          </div>
          <div><p class="mb-5 text-xs uppercase tracking-[0.2em] text-lime-200">A fresh start</p>
            <p class="max-w-lg text-5xl font-medium leading-[1.12] tracking-tight xl:text-6xl">Your next chapter<br>starts here.</p>
          </div>
          <p class="mt-16 text-xs text-emerald-200">Elite Body System</p>
        </aside>
        <section class="flex min-h-dvh flex-col bg-stone-50 px-6 py-8 sm:px-12 lg:px-16">
          <a href="/" class="w-fit text-xs font-bold tracking-[0.15em] text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-4 lg:hidden">ELITE BODY SYSTEM</a>
          <div class="mx-auto my-auto w-full max-w-sm py-16" aria-busy=${busy ? "true" : "false"}>
            <div class="mb-8 flex size-11 items-center justify-center rounded-xl bg-emerald-950 text-xs font-semibold tracking-wide text-lime-200" aria-hidden="true">EBS</div>
            <p class="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">${mode === "home" ? "Your account" : "Welcome"}</p>
            <h1 class="text-3xl font-semibold tracking-tight text-emerald-950">${mode === "home" ? "You’re signed in." : mode === "confirm" ? "Confirm it’s you." : "Sign in to your account."}</h1>
            ${mode === "request" ? html`
              <p class="mt-4 text-sm leading-6 text-stone-600">Enter your email and we’ll send you a secure sign-in link. No password needed.</p>
              <form class="mt-8 space-y-5" @submit=${(event: Event) => { event.preventDefault(); actions.requestLink(); }}>
                <div><label for="email" class="mb-2 block text-sm font-medium text-emerald-950">Email address</label>
                  <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254"
                    class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-emerald-950 placeholder:text-stone-400 focus:border-emerald-800 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-800 disabled:opacity-60"
                    placeholder="you@example.com" .value=${email} ?disabled=${busy}
                    @input=${(event: Event) => { actions.setEmail({ email: (event.target as HTMLInputElement).value }); }}></div>
                <button class=${button} type="submit" ?disabled=${busy}>${busy ? busyLabel : "Email me a sign-in link"}</button>
              </form>
              <p class="mt-5 text-xs leading-5 text-stone-500">Use the email associated with your account. Links expire after 10 minutes.</p>
            ` : mode === "confirm" ? html`
              ${busy ? html`<p class="mt-5 text-sm text-stone-600" role="status">${busyLabel}</p>` : account ? html`
                <p class="mt-4 break-words text-sm leading-6 text-stone-600">Continue as <strong class="font-medium text-emerald-950">${account.email}</strong>?</p>
                <button class="${button} mt-8" type="button" @click=${actions.redeem}>Continue to Elite Body System</button>` : ""}
              <a href="/sign-in" class="mt-6 inline-block text-sm font-medium text-emerald-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Request a new link</a>
            ` : html`
              ${account ? html`<p class="mt-4 break-words text-sm text-stone-600">${account.email}</p>
                <p class="mt-6 text-sm leading-6 text-stone-600">Welcome to Elite Body System.</p>
                <button class="${button} mt-8" type="button" ?disabled=${busy} @click=${actions.signOut}>${busy ? busyLabel : "Sign out"}</button>`
                : html`<p class="mt-5 text-sm text-stone-600" role="status">Loading your account…</p>`}
            `}
            <div aria-live="polite" aria-atomic="true">${message ? html`<p class="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950" role="status">${message}</p>` : ""}</div>
            ${problem ? html`<p class="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900" role="alert">${problem}</p>` : ""}
          </div>
          <p class="text-center text-xs text-stone-500">Secure access · Email magic link</p>
        </section>
      </div>`;
}
