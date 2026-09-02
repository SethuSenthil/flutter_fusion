// Keep the machine awake for the duration of a build (macOS only, for now).
//
// Spawns `caffeinate` bound to this process's PID (`-w <pid>`) so it stops
// automatically when Flutter Fusion exits — including on error or crash — with
// no explicit teardown needed. If the Mac is already being kept awake (by the
// user or another app), we leave that state untouched and never start our own
// assertion, so we can't accidentally let it sleep afterwards.
//
// NOTE: caffeinate is a long-lived background process, so it is spawned directly
// rather than through `runCommand` (which awaits completion). This is a
// deliberate exception, like `lib/update.ts`.

import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { infoStyle } from "./util.ts";

/** True if an existing power assertion is already preventing sleep. */
async function alreadyKeptAwake(): Promise<boolean> {
  const res = await runCommand("pmset", ["-g", "assertions"], {
    label: "pmset assertions (keep-awake check)",
  });
  if (!res.success) return false; // Can't tell — safer to start our own.

  const assertionValue = (name: string): number => {
    const m = res.stdout.match(new RegExp(`${name}\\s+(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  return assertionValue("PreventUserIdleSystemSleep") > 0 ||
    assertionValue("PreventSystemSleep") > 0;
}

/**
 * Start keeping the Mac awake until this process exits. No-op when the feature
 * is disabled or on non-macOS platforms. Nothing needs to be stopped
 * explicitly: `caffeinate -w <pid>` exits on its own when we do.
 */
export async function keepAwake(ctx: Context): Promise<void> {
  if (!ctx.config.keep_awake) return;

  if (Deno.build.os !== "darwin") {
    if (ctx.config.verbose) {
      console.log(
        "%c☕ keep_awake is only supported on macOS for now; skipping.",
        infoStyle,
      );
    }
    return;
  }

  if (await alreadyKeptAwake()) {
    console.log(
      "%c☕ This Mac is already being kept awake; leaving that as-is.",
      infoStyle,
    );
    return;
  }

  // Default assertion prevents idle system sleep; -m also guards against disk
  // idle sleep and -s against system sleep on AC power. -w ties caffeinate's
  // lifetime to ours so it always cleans itself up.
  const child = new Deno.Command("caffeinate", {
    args: ["-i", "-m", "-s", "-w", String(Deno.pid)],
  }).spawn();
  // Don't let the child keep our event loop alive.
  child.unref();

  console.log(
    "%c☕ Keeping this Mac awake until Flutter Fusion finishes.",
    infoStyle,
  );
}
