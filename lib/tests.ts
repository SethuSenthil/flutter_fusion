// Flutter test runner. Runs `flutter test` before the build so a failing suite
// aborts the pipeline before any versioning, building, or git work happens.
//
// Tests are streamed live to the terminal (see `runCommand`'s `stream` option)
// so flutter's own progress output — the running counter and pass/fail summary —
// is preserved rather than buffered.

import * as path from "jsr:@std/path@1.1.6";
import { exists, walk } from "jsr:@std/fs@1.0.24";
import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { infoStyle, successStyle } from "./util.ts";

/** True if the project has at least one `*_test.dart` under `test/`. */
async function hasTests(projectRoot: string): Promise<boolean> {
  const testDir = path.join(projectRoot, "test");
  if (!(await exists(testDir))) return false;
  for await (
    const entry of walk(testDir, { exts: [".dart"], includeDirs: false })
  ) {
    if (entry.name.endsWith("_test.dart")) return true;
  }
  return false;
}

/**
 * Run the project's Flutter tests when enabled. Behavior:
 *
 * - No tests found + `run_tests` left at its default → quietly skip.
 * - No tests found + `run_tests` set explicitly → error out (tell the user how
 *   to disable it).
 * - Tests found → stream `flutter test`; throw on failure so `main.ts` exits 1.
 *
 * Callers should only invoke this when `config.run_tests` is true.
 */
export async function runTests(ctx: Context): Promise<void> {
  const { config, projectRoot } = ctx;

  if (!(await hasTests(projectRoot))) {
    if (config.run_tests_explicit) {
      throw new Error(
        "Running tests is enabled but no tests were found in your test/ folder. " +
          "Add tests, or disable this by setting `run_tests: false` under " +
          "flutter_fusion in your pubspec.yaml.",
      );
    }
    // Default behavior: no tests, nothing to run — carry on silently.
    return;
  }

  console.log("%c🧪 Running Flutter tests...", infoStyle);

  const result = await runCommand("flutter", ["test"], {
    label: "flutter test",
    stream: true,
    cwd: projectRoot,
  });

  if (!result.success) {
    throw new Error(
      "Flutter tests failed. Fix the failing tests, or disable test runs by " +
        "setting `run_tests: false` under flutter_fusion in your pubspec.yaml.",
    );
  }

  console.log("%c✅ All tests passed", successStyle);
}
