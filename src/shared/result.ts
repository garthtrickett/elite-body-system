export type Result<Value, Failure> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Failure }>;

export const ok = <Value>(value: Value): Result<Value, never> => ({ ok: true, value });
export const err = <Failure>(error: Failure): Result<never, Failure> => ({ ok: false, error });
