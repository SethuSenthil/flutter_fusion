# AGENTS.md

Guidance for AI agents and contributors working on Flutter Fusion.

## What this is

A Deno CLI that automates the Flutter release chore: bump the version, build the
iOS IPA, validate + upload it to App Store Connect, then commit and push. Users
run it as `flutter-fusion` in their Flutter project root.

## Runtime

- **Deno 2.x** (developed against 2.9.5). Check with `deno --version`.
- Dependencies use fully-qualified `jsr:@std/*` (and one `https://deno.land/x`
  spinner) specifiers **inline** in the source. This is deliberate: the CLI is
  installed directly from a URL (`deno install -g <url>/main.ts`), and a remote
  install does **not** apply the local `deno.json` import map. Do not convert
  imports to bare specifiers.
- YAML parsing uses `jsr:@std/yaml` (Deno-native) rather than `npm:yaml`, so no
  npm runtime needs to be bundled.

## Tasks

```bash
deno task dev      # run against the current working directory
deno task check    # type-check main.ts + build.ts
deno task fmt      # format
deno task lint     # lint
deno task build    # mirror source into docs/ and write docs/version.json
deno task install  # install the local checkout globally as `flutter-fusion`
```

## Architecture

`main.ts` is a thin orchestrator. Logic lives in `lib/`:

| File                | Responsibility                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| `lib/meta.ts`       | `VERSION` — the single source of truth for the version number.            |
| `lib/update.ts`     | Self-update check against the hosted `version.json`.                      |
| `lib/config.ts`     | Project-root detection + merge pubspec/global-pubspec/CLI into `Context`. |
| `lib/logger.ts`     | `initLog` + `runCommand` — command execution and `flutter_fusion.log`.    |
| `lib/versioning.ts` | pubspec version / build-number bumping.                                   |
| `lib/tests.ts`      | `flutter test` gate — streamed, run before build (config-driven).         |
| `lib/ios.ts`        | iOS build → validate → upload.                                            |
| `lib/spm.ts`        | `spm up` / `spm outdated` — Swift Package Manager dependency updates.     |
| `lib/git.ts`        | Stage, commit (from `COMMIT_EDITMSG`), push.                              |
| `lib/notify.ts`     | Desktop notifications (macOS).                                            |
| `lib/util.ts`       | Console style strings + `getTimeDifference`.                              |

### Command logging

Every external command (`flutter`, `xcrun`, `git`, `osascript`) must go through
`runCommand` in `lib/logger.ts`. It captures stdout/stderr/exit-code to
`<projectRoot>/flutter_fusion.log`, which is **recreated fresh on every run** by
`initLog`. If you add a new external command, route it through `runCommand` so it
is logged — do not call `new Deno.Command(...).output()` directly (the one
exception is `lib/update.ts`, which runs before the log is initialized).

Note: `flutter_fusion.log` is written into the **user's** Flutter project, not
this repo. Users should add it to their own project's `.gitignore`.

### Subcommands

`main.ts` reads positional args (`ctx.positionals`) before the build pipeline.
`spm up` / `spm outdated` short-circuit the normal build and run
`lib/spm.ts` instead. New subcommands should follow the same pattern: check
`ctx.positionals[0]`, run, and `return` before the build steps.

### SPM update strategy

Xcode has no "upgrade SPM deps" CLI, so `lib/spm.ts` backs up `Package.resolved`
to `.dart_tool/flutter_fusion/spm/`, deletes it, regenerates via
`xcodebuild -resolvePackageDependencies`, and diffs. `spm up` keeps the new file
(with the old kept as a restore point); `spm outdated` reverts to the original
and only applies on a `y` confirmation. `autoSpmOnBuild` runs one of these before
the build when `spm_update_on_build` / `spm_outdated_on_build` is set (both set →
warn + `outdated`), and swallows errors so it never aborts a build.

## Hosting & release flow

- `docs/` is published via GitHub Pages to `flutter-fusion.sethusenthil.com`
  (see `docs/CNAME`). It must mirror the source tree so the hosted `main.ts`'s
  relative `./lib/*` imports resolve over HTTP.
- To cut a release:
  1. Bump `VERSION` in `lib/meta.ts`.
  2. `deno task build` (updates `docs/main.ts`, `docs/lib/*`, `docs/version.json`).
  3. Commit and push. Installed clients see the new `version.json` and are
     offered the upgrade on their next run.

## Testing without an Apple build

You don't need Apple credentials or Xcode to exercise most of the pipeline. In a
throwaway Flutter project (any dir with a `pubspec.yaml` containing a
`flutter_fusion:` block), set `ios: false` and enable `git: true` to drive the
`runCommand` + logging paths via `git add/commit/push`, then inspect
`flutter_fusion.log`. Running from a subfolder like `ios/` should still resolve
the project root and write the log there.

## Scope note

Android and Web builds are intentionally not implemented yet (they print a
"not supported" notice).
