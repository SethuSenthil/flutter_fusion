// Flutter Fusion — the ultimate Flutter build tool.
//
// Run locally:
//   deno run --allow-read --allow-env --allow-run --allow-write --allow-sys --allow-net main.ts
// Install globally:
//   deno install -g -f -n flutter-fusion --allow-read --allow-env --allow-run --allow-write --allow-sys --allow-net https://flutter-fusion.sethusenthil.com/main.ts
//
// This file is a thin orchestrator; the real work lives in ./lib/*. See
// AGENTS.md for the architecture and release/hosting flow.

import { VERSION } from "./lib/meta.ts";
import { checkForUpdates } from "./lib/update.ts";
import { loadContext } from "./lib/config.ts";
import { initLog } from "./lib/logger.ts";
import { applyVersioning } from "./lib/versioning.ts";
import { buildIos } from "./lib/ios.ts";
import { commitAndPush, ensureCommitMessageFile } from "./lib/git.ts";
import { autoSpmOnBuild, runSpm } from "./lib/spm.ts";
import { runTests } from "./lib/tests.ts";
import { runPubUpgrade } from "./lib/pub.ts";
import { keepAwake } from "./lib/awake.ts";
import { errorStyle } from "./lib/util.ts";

const startTime = new Date();

async function run(): Promise<void> {
  // 1. Offer a self-update if a newer version is published.
  await checkForUpdates();

  // 2. Detect the project and load merged configuration.
  const ctx = await loadContext();

  // 3. Start a fresh flutter_fusion.log for this run.
  await initLog(ctx.projectRoot, VERSION);

  if (ctx.config.verbose) console.log("🔬 Verbose mode enabled");

  // `spm` subcommand short-circuits the build pipeline.
  const [command, action] = ctx.positionals;
  if (command === "spm") {
    await runSpm(ctx, action);
    return;
  }

  // 4. Keep the machine awake for the rest of the run (macOS only).
  await keepAwake(ctx);

  // 5. Upgrade Flutter packages before tests/spm so everything downstream uses
  //    the freshest allowed versions.
  await runPubUpgrade(ctx);

  // 6. Run the test suite; a failure aborts before anything is mutated.
  if (ctx.config.run_tests) {
    await runTests(ctx);
  }

  // 7. Validate git + prepare COMMIT_EDITMSG early, so the user can edit their
  //    commit message while the build runs.
  let commitMessagePath: string | undefined;
  if (ctx.config.git) {
    commitMessagePath = await ensureCommitMessageFile(ctx);
  }

  // 8. Bump version / build number as configured.
  await applyVersioning(ctx);

  // 9. Optionally refresh Swift packages before building (config-driven).
  await autoSpmOnBuild(ctx);

  // 10. Build targets.
  if (ctx.config.ios) {
    await buildIos(ctx, startTime);
  }
  if (ctx.config.android) {
    console.log(
      "%cAndroid build is not supported yet. Please check back later.",
      errorStyle,
    );
  }
  if (ctx.config.web) {
    console.log(
      "%cWeb build is not supported yet. Please check back later.",
      errorStyle,
    );
  }

  // 11. Commit and push.
  if (ctx.config.git && commitMessagePath) {
    await commitAndPush(ctx, commitMessagePath);
  }
}

try {
  await run();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`%c❌ ${message}`, errorStyle);
  Deno.exit(1);
}

// https://keith.github.io/xcode-man-pages/altool.1.html
