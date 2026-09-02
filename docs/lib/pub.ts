// Upgrade Flutter package dependencies (`flutter pub upgrade`) before the build.
//
// Runs ahead of the tests and the Swift Package Manager step so the whole build
// resolves against the freshest package versions allowed by pubspec.yaml.
// Config-driven and on by default.

import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { infoStyle, successStyle } from "./util.ts";

export async function runPubUpgrade(ctx: Context): Promise<void> {
  if (!ctx.config.pub_upgrade) return;

  console.log(
    "%c⬆️ Upgrading Flutter packages (flutter pub upgrade)...",
    infoStyle,
  );

  // verbose:true so the resolved/changed packages are echoed and captured in
  // flutter_fusion.log.
  const res = await runCommand("flutter", ["pub", "upgrade"], {
    label: "flutter pub upgrade",
    verbose: true,
  });

  if (!res.success) {
    throw new Error(
      "`flutter pub upgrade` failed. See flutter_fusion.log for details, or " +
        "disable this by setting `pub_upgrade: false` under flutter_fusion in " +
        "your pubspec.yaml.",
    );
  }

  console.log("%c✅ Flutter packages upgraded", successStyle);
}
