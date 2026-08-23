// Swift Package Manager (SPM) dependency management for Flutter iOS projects.
//
// Xcode exposes no CLI to *upgrade* resolved SPM dependencies. The workaround is
// to delete the workspace's `Package.resolved` and let
// `xcodebuild -resolvePackageDependencies` regenerate it against the version
// ranges declared in the packages — which re-resolves to the newest allowed
// versions. Before touching anything we back the current file up to a cache dir
// inside the project (`.dart_tool/flutter_fusion/spm/`), so we can always
// restore it.
//
// Two commands:
//   flutter-fusion spm up        upgrade in place, print each module old -> new
//   flutter-fusion spm outdated  regenerate, show available updates, revert to
//                                the cached file, then prompt y/n to apply
//
// Both can also run automatically before a build via the pubspec config
// (`spm_update_on_build` / `spm_outdated_on_build`).

import * as path from "jsr:@std/path@1.1.6";
import { ensureDir, exists, expandGlob } from "jsr:@std/fs@1.0.24";
import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { errorStyle, infoStyle, successStyle, warnStyle } from "./util.ts";

/** Cache dir (relative to project root) for Package.resolved backups. */
const CACHE_DIR = path.join(".dart_tool", "flutter_fusion", "spm");
const OLD_BACKUP = "Package.resolved.old";
const NEW_BACKUP = "Package.resolved.new";

interface Pin {
  identity: string;
  /** Semver version, or null for branch/revision pins. */
  version: string | null;
  revision: string | null;
}

interface Diff {
  updated: { identity: string; from: string; to: string }[];
  added: { identity: string; to: string }[];
  removed: { identity: string; from: string }[];
}

interface Workspace {
  /** Path to the .xcworkspace, relative to the project root. */
  workspace: string;
  scheme: string;
}

/** A short human label for a pin's resolved state (version or short revision). */
function pinLabel(pin: Pin | undefined): string {
  if (!pin) return "—";
  if (pin.version) return pin.version;
  if (pin.revision) return pin.revision.slice(0, 7);
  return "?";
}

/** Parse a Package.resolved document into identity -> Pin, handling v1/v2/v3. */
// deno-lint-ignore no-explicit-any
function parsePins(json: any): Map<string, Pin> {
  const map = new Map<string, Pin>();
  const pins = json?.pins ?? json?.object?.pins ?? [];
  for (const p of pins) {
    const identity = p.identity ?? p.package ?? "unknown";
    const state = p.state ?? {};
    map.set(identity, {
      identity,
      version: state.version ?? null,
      revision: state.revision ?? null,
    });
  }
  return map;
}

function diffPins(oldMap: Map<string, Pin>, newMap: Map<string, Pin>): Diff {
  const diff: Diff = { updated: [], added: [], removed: [] };
  for (const [identity, np] of newMap) {
    const op = oldMap.get(identity);
    if (!op) {
      diff.added.push({ identity, to: pinLabel(np) });
    } else if (pinLabel(op) !== pinLabel(np)) {
      diff.updated.push({ identity, from: pinLabel(op), to: pinLabel(np) });
    }
  }
  for (const [identity, op] of oldMap) {
    if (!newMap.has(identity)) {
      diff.removed.push({ identity, from: pinLabel(op) });
    }
  }
  diff.updated.sort((a, b) => a.identity.localeCompare(b.identity));
  diff.added.sort((a, b) => a.identity.localeCompare(b.identity));
  diff.removed.sort((a, b) => a.identity.localeCompare(b.identity));
  return diff;
}

function hasChanges(diff: Diff): boolean {
  return diff.updated.length + diff.added.length + diff.removed.length > 0;
}

function printDiff(diff: Diff): void {
  if (!hasChanges(diff)) {
    console.log(
      "%c✅ All Swift packages are already up to date.",
      successStyle,
    );
    return;
  }
  const pad = (s: string) => s.padEnd(32);
  if (diff.updated.length) {
    console.log("%c📦 Updates available:", infoStyle);
    for (const u of diff.updated) {
      console.log(`   ${pad(u.identity)} ${u.from} → ${u.to}`);
    }
  }
  if (diff.added.length) {
    console.log("%c➕ Added:", infoStyle);
    for (const a of diff.added) console.log(`   ${pad(a.identity)} ${a.to}`);
  }
  if (diff.removed.length) {
    console.log("%c➖ Removed:", infoStyle);
    for (const r of diff.removed) {
      console.log(`   ${pad(r.identity)} ${r.from}`);
    }
  }
}

/** Locate the .xcworkspace to resolve against (config override or auto-detect). */
async function locateWorkspace(ctx: Context): Promise<Workspace | null> {
  const scheme = ctx.config.spm_scheme ?? "Runner";
  if (ctx.config.spm_workspace) {
    return { workspace: ctx.config.spm_workspace, scheme };
  }
  // Auto-detect: iOS first, then macOS.
  for (const dir of ["ios", "macos"]) {
    for await (
      const entry of expandGlob(`${dir}/*.xcworkspace`, {
        root: ctx.projectRoot,
      })
    ) {
      if (entry.isDirectory) {
        return {
          workspace: path.relative(ctx.projectRoot, entry.path),
          scheme,
        };
      }
    }
  }
  return null;
}

function resolvedPathFor(ctx: Context, ws: Workspace): string {
  return path.join(
    ctx.projectRoot,
    ws.workspace,
    "xcshareddata",
    "swiftpm",
    "Package.resolved",
  );
}

async function regenerate(ctx: Context, ws: Workspace) {
  return await runCommand(
    "xcodebuild",
    [
      "-resolvePackageDependencies",
      "-workspace",
      ws.workspace,
      "-scheme",
      ws.scheme,
    ],
    {
      verbose: ctx.config.verbose,
      label: "xcodebuild resolve",
      cwd: ctx.projectRoot,
    },
  );
}

interface ResolveResult {
  /** Content of the pre-existing Package.resolved, or null if there was none. */
  oldText: string | null;
  /** Content of the freshly regenerated Package.resolved. */
  newText: string;
  diff: Diff;
  resolvedPath: string;
}

/**
 * Back up the current Package.resolved, delete it, regenerate via xcodebuild,
 * and diff old vs new. Leaves the freshly generated file in place. Restores the
 * original file if regeneration fails.
 */
async function resolveAndDiff(
  ctx: Context,
  ws: Workspace,
): Promise<ResolveResult> {
  const resolvedPath = resolvedPathFor(ctx, ws);
  const cacheDir = path.join(ctx.projectRoot, CACHE_DIR);
  await ensureDir(cacheDir);

  const hadOld = await exists(resolvedPath);
  const oldText = hadOld ? await Deno.readTextFile(resolvedPath) : null;
  if (oldText !== null) {
    await Deno.writeTextFile(path.join(cacheDir, OLD_BACKUP), oldText);
    await Deno.remove(resolvedPath);
  }

  const res = await regenerate(ctx, ws);
  if (!res.success || !(await exists(resolvedPath))) {
    // Restore whatever we had so we never leave the project worse off.
    if (oldText !== null) await Deno.writeTextFile(resolvedPath, oldText);
    throw new Error(
      "xcodebuild could not resolve Swift package dependencies. This project may not use SPM, or the Xcode/Flutter setup is incomplete. See flutter_fusion.log for details.",
    );
  }

  const newText = await Deno.readTextFile(resolvedPath);
  await Deno.writeTextFile(path.join(cacheDir, NEW_BACKUP), newText);

  const oldPins = oldText !== null
    ? parsePins(JSON.parse(oldText))
    : new Map<string, Pin>();
  const newPins = parsePins(JSON.parse(newText));
  return { oldText, newText, diff: diffPins(oldPins, newPins), resolvedPath };
}

/** Remove the cache backups once a decision has been made. */
async function clearCache(ctx: Context, keepOld: boolean): Promise<void> {
  const cacheDir = path.join(ctx.projectRoot, CACHE_DIR);
  for (
    const [name, keep] of [[OLD_BACKUP, keepOld], [NEW_BACKUP, false]] as const
  ) {
    if (keep) continue;
    try {
      await Deno.remove(path.join(cacheDir, name));
    } catch {
      // Nothing to clean up.
    }
  }
}

async function requireWorkspace(ctx: Context): Promise<Workspace> {
  const ws = await locateWorkspace(ctx);
  if (!ws) {
    throw new Error(
      "No .xcworkspace found under ios/ or macos/. Set `spm_workspace` in your pubspec's flutter_fusion block to point at it.",
    );
  }
  return ws;
}

/** `spm up`: upgrade Package.resolved in place and report what changed. */
export async function spmUp(ctx: Context): Promise<void> {
  const ws = await requireWorkspace(ctx);
  console.log("%c⬆️  Upgrading Swift packages...", infoStyle);

  const { oldText, diff } = await resolveAndDiff(ctx, ws);
  printDiff(diff);

  if (!hasChanges(diff)) {
    await clearCache(ctx, false);
    return;
  }
  if (oldText === null) {
    console.log("%c✅ Package.resolved created.", successStyle);
  } else {
    console.log("%c✅ Swift packages upgraded.", successStyle);
    console.log(
      `%c   Previous Package.resolved backed up to ${
        path.join(CACHE_DIR, OLD_BACKUP)
      }`,
      infoStyle,
    );
  }
  // Keep the .old backup as a restore point; drop the redundant .new copy.
  await clearCache(ctx, /* keepOld */ oldText !== null);
}

/**
 * `spm outdated`: regenerate to discover available updates, show them, revert to
 * the original file (non-destructive), then prompt to apply.
 */
export async function spmOutdated(ctx: Context): Promise<void> {
  const ws = await requireWorkspace(ctx);
  console.log("%c🔎 Checking for Swift package updates...", infoStyle);

  const { oldText, newText, diff, resolvedPath } = await resolveAndDiff(
    ctx,
    ws,
  );
  printDiff(diff);

  // If there was no prior file we can't revert to "nothing" — keep the fresh one.
  if (oldText === null) {
    console.log("%c✅ Package.resolved created.", successStyle);
    await clearCache(ctx, false);
    return;
  }

  // Revert to the original so the default state is unchanged.
  await Deno.writeTextFile(resolvedPath, oldText);

  if (!hasChanges(diff)) {
    await clearCache(ctx, false);
    return;
  }

  const proceed = confirm("Apply these Swift package updates?");
  if (proceed) {
    await Deno.writeTextFile(resolvedPath, newText);
    console.log("%c✅ Applied Swift package updates.", successStyle);
  } else {
    console.log("%cKept current Swift package versions.", warnStyle);
  }
  await clearCache(ctx, false);
}

/** Dispatch the `spm` subcommand. */
export async function runSpm(ctx: Context, action?: string): Promise<void> {
  if (Deno.build.os !== "darwin") {
    throw new Error(
      "SPM commands require macOS (they use `xcodebuild`).",
    );
  }
  switch (action) {
    case "up":
    case "update":
    case "upgrade":
      await spmUp(ctx);
      break;
    case "outdated":
      await spmOutdated(ctx);
      break;
    default:
      throw new Error(
        `Unknown command 'spm ${
          action ?? ""
        }'. Use 'spm up' or 'spm outdated'.`,
      );
  }
}

/**
 * Optionally run an SPM step before a build, driven by pubspec config. Failures
 * are downgraded to warnings so they never abort the build. If both flags are
 * set we warn and use the less destructive `outdated`.
 */
export async function autoSpmOnBuild(ctx: Context): Promise<void> {
  const { spm_update_on_build, spm_outdated_on_build } = ctx.config;
  if (!spm_update_on_build && !spm_outdated_on_build) return;

  let mode: "up" | "outdated";
  if (spm_update_on_build && spm_outdated_on_build) {
    console.log(
      "%c⚠️ Both spm_update_on_build and spm_outdated_on_build are set. Using 'outdated' (less destructive).",
      warnStyle,
    );
    mode = "outdated";
  } else {
    mode = spm_update_on_build ? "up" : "outdated";
  }

  try {
    await runSpm(ctx, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`%c⚠️ Skipping SPM ${mode}: ${message}`, errorStyle);
  }
}
