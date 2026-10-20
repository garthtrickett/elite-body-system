export function createSamRuntime<Model, Proposal, State, Effect extends Readonly<{ id: number }>>(config: Readonly<{
  initial: Model;
  accept: (model: Model, proposal: Proposal) => Model;
  represent: (model: Model) => State;
  next: (model: Model) => Effect | undefined;
  present: (state: State) => void;
  perform: (effect: Effect) => Promise<Proposal>;
  failed: (effect: Effect) => Proposal;
}>) {
  let model = config.initial, dispatched = 0, disposed = false;
  function propose(proposal: Proposal): void {
    if (disposed) return;
    model = config.accept(model, proposal);
    config.present(config.represent(model));
    const effect = config.next(model);
    if (!effect || effect.id <= dispatched) return;
    dispatched = effect.id;
    void Promise.resolve().then(() => disposed ? undefined : config.perform(effect))
      .then(result => { if (result !== undefined) propose(result); }).catch(() => propose(config.failed(effect)));
  }
  config.present(config.represent(model));
  return { propose, getModel: () => model, dispose: () => { disposed = true; } } as const;
}
