/** Bound work within one process; database claims still serialize each conversation. */
export function inboundConcurrency(value = process.env.SARI_INBOUND_CONCURRENCY): number {
  const concurrency = value === undefined ? 2 : Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('SARI_INBOUND_CONCURRENCY must be an integer between 1 and 4');
  }
  return concurrency;
}

export function startInboundPump<T>(options: {
  concurrency: number;
  maintain: () => Promise<void>;
  claim: () => Promise<T | null>;
  run: (job: T) => Promise<unknown>;
  onError: () => void;
}): () => Promise<void> {
  const limit = inboundConcurrency(String(options.concurrency));
  let stopping = false;
  let polling: Promise<void> | undefined;
  const active = new Set<Promise<void>>();
  const tick = () => {
    if (stopping || polling || active.size >= limit) return;
    polling = (async () => {
      await options.maintain();
      while (!stopping && active.size < limit) {
        const job = await options.claim();
        if (job === null) return;
        // Drain a claim already in progress at shutdown rather than abandon its lease.
        const task = Promise.resolve().then(() => options.run(job)).then(() => {}, options.onError)
          .finally(() => { active.delete(task); });
        active.add(task);
      }
    })().catch(options.onError).finally(() => { polling = undefined; });
  };
  const timer = setInterval(tick, 500);
  tick();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await polling;
    await Promise.allSettled(Array.from(active));
  };
}
