import { serverFn } from "@moonsjs/server";
import { z } from "zod";

/**
 * Example server function. The canary string lives ONLY in server code: the
 * client build replaces this file with an RPC stub, and `moons check` fails
 * if the string ever reaches `dist/client` (see `vite.config.ts`).
 */
const CANARY = "MOONS_APP_CANARY_4f1c";

export const hello = serverFn({
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ input }) => {
    const canary = CANARY;
    if (canary.length === 0) {
      throw new Error("unreachable");
    }
    return { message: `Hello, ${input.name}!` };
  },
});
