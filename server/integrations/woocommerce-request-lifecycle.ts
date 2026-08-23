import type { IncomingMessage, ServerResponse } from 'node:http';

export type WooCommerceRequestAbortContext = {
  req: IncomingMessage;
  res: ServerResponse;
};

type WooCommerceRequestLifecycle = {
  controller: AbortController;
  refs: number;
  req: IncomingMessage;
  res: ServerResponse;
  abort: () => void;
  close: () => void;
};

const wooCommerceRequestLifecycles = new WeakMap<object, WooCommerceRequestLifecycle>();

function retainWooCommerceRequestLifecycle(
  ctx: WooCommerceRequestAbortContext,
): WooCommerceRequestLifecycle {
  const existing = wooCommerceRequestLifecycles.get(ctx.req);
  if (existing) {
    existing.refs += 1;
    return existing;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => {
    if (!ctx.res.writableEnded) controller.abort();
  };
  const lifecycle: WooCommerceRequestLifecycle = {
    controller,
    refs: 1,
    req: ctx.req,
    res: ctx.res,
    abort,
    close,
  };
  wooCommerceRequestLifecycles.set(ctx.req, lifecycle);
  ctx.req.once('aborted', abort);
  ctx.res.once('close', close);
  if (ctx.req.aborted || ctx.req.destroyed) controller.abort();
  return lifecycle;
}

function releaseWooCommerceRequestLifecycle(lifecycle: WooCommerceRequestLifecycle): void {
  lifecycle.refs -= 1;
  if (lifecycle.refs > 0) return;
  lifecycle.req.off('aborted', lifecycle.abort);
  lifecycle.res.off('close', lifecycle.close);
  if (wooCommerceRequestLifecycles.get(lifecycle.req) === lifecycle) {
    wooCommerceRequestLifecycles.delete(lifecycle.req);
  }
}

export async function withWooCommerceRequestAbortSignal<T>(
  ctx: WooCommerceRequestAbortContext,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const lifecycle = retainWooCommerceRequestLifecycle(ctx);
  try {
    return await action(lifecycle.controller.signal);
  } finally {
    releaseWooCommerceRequestLifecycle(lifecycle);
  }
}
