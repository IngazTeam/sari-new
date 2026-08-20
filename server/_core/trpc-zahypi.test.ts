import { afterEach, describe, expect, it } from "vitest";

import { getOptionalZahyPiRequestContext } from "../ai/zahypi-client";
import { protectedProcedure, router } from "./trpc";

afterEach(() => {
  delete process.env.ZAHYPI_ENABLED;
});

describe("protectedProcedure ZahyPi context", () => {
  it("does not guess a tenant for users who may belong to multiple merchants", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    const testRouter = router({
      probe: protectedProcedure.query(() => getOptionalZahyPiRequestContext()),
    });
    const caller = testRouter.createCaller({
      req: {} as never,
      res: {} as never,
      user: { id: 9, role: "user" } as never,
    });

    await expect(caller.probe()).resolves.toBeUndefined();
  });
});
