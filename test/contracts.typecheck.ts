import type { Account, Auth } from "../src/features/auth/index.ts";
import type { AuthUiModel } from "../src/features/auth/browser.ts";

// Compile-only negative examples prove the public interface protects shared data.
function publicContracts(account: Account, auth: Auth): void {
  // @ts-expect-error Account data is immutable to callers.
  account.email = "changed@example.test";
  // @ts-expect-error Auth operations cannot be replaced by callers.
  auth.signOut = async () => ({ ok: true, value: { signedOut: true } });
  // @ts-expect-error Operations take a named input object.
  void auth.requestLink("member@example.test");
  void auth.requestLink({ email: "member@example.test", clientKey: "client" });
}
void publicContracts;

function immutableUiModel(model: AuthUiModel): void {
  // @ts-expect-error Only the SAM acceptor replaces model state; callers cannot mutate it.
  model.email = "changed@example.test";
}
void immutableUiModel;
