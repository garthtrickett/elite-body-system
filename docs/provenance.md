# Extraction provenance

Inspected source: the operator's `/home/gust/code/abby` checkout at `5fa4fe4`
(`5fa4fe4 Merge pull request #451 ...`), without changing that checkout or reading
its environment file. This repository has independent Git history.

| New code | Source or rationale |
| --- | --- |
| `src/shared/result.ts` | The generic Result type and constructors from the first lines of Abby's `src/core/model.ts` |
| `src/features/auth/email.ts` | Adapted conservative validation from Abby's `src/shared/email-address.ts` |
| `.kanelrc.cjs` | Adapted Abby's config, including `makeKyselyHook()` and the ESM Database type export adjustment |
| `tsconfig.json` | Adapted strict TypeScript/NodeNext settings; new project paths and DOM types |
| Auth operations and PostgreSQL adapter | Fresh function-based implementation informed by Abby's identity security patterns: digests, explicit confirmation, atomic redemption, database time, and shared budgets |
| Browser sign-in | Fresh lit-html/Tailwind UI; retains the safe fragment-removal and explicit-confirmation pattern |
| Browser SAM loop | Adapts the deterministic transition/external-effect pattern in Abby's `src/core/transition.ts` and `src/core/runtime.ts` together with the separate lit-html `dashboardView(state, actions)` in its dashboard `view.ts`; replaces mutable controller classes with a pure acceptor and immutable model |
| Disposable PostgreSQL script | Adapted the isolated-container approach from Abby's helper; adds explicit resource caps and a project-specific label |

Kanel-generated files were produced by introspecting this project's new schema.
No Abby migrations, generated tables, clinic grants, classes, provider adapters,
customer data, credentials, `.env`, build outputs, Git history, product UI,
Twilio/Cliniko integrations, voice/LLM workflows, or deployment configuration were
copied. The new remote email adapter uses native fetch to Resend and can be
replaced at the typed delivery seam.

External implementation references:

- [Kanel's Kysely extension](https://kristiandupont.github.io/kanel/kanel-kysely.html)
- [Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli)
- [Resend send-email interface](https://resend.com/docs/api-reference/emails/send-email)
- [OWASP token lifecycle guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
