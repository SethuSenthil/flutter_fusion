// Centralized command execution + logging.
//
// Every external command the CLI runs (flutter, xcrun, git, osascript) goes
// through `runCommand`, which persists the invocation and its stdout/stderr to
// `<projectRoot>/flutter_fusion.log`. The log is recreated fresh on every run
// (see `initLog`) so it always reflects the most recent build.

import * as path from "jsr:@std/path@1.1.6";

const SEPARATOR = "-".repeat(60);

let logPath: string | null = null;

function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Create (truncating any existing file) `flutter_fusion.log` in the project
 * root and write a run header. Must be called once, before any `runCommand`.
 */
export async function initLog(
  projectRoot: string,
  version: string,
): Promise<void> {
  logPath = path.join(projectRoot, "flutter_fusion.log");
  const header = `Flutter Fusion v${version}\n` +
    `Run started: ${timestamp()}\n` +
    `Project:     ${projectRoot}\n` +
    `${"=".repeat(60)}\n\n`;
  try {
    await Deno.writeTextFile(logPath, header); // no `append` => truncates
  } catch {
    // Never let a logging problem abort a build.
    console.error(
      "%c⚠️ Could not initialize flutter_fusion.log",
      "color: yellow",
    );
    logPath = null;
  }
}

async function appendToLog(block: string): Promise<void> {
  if (!logPath) return;
  try {
    await Deno.writeTextFile(logPath, block, { append: true });
  } catch {
    // Swallow logging failures on purpose.
  }
}

export interface CommandResult {
  code: number;
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Echo stdout/stderr to the console (in addition to the log file). */
  verbose?: boolean;
  /** Friendly label recorded in the log alongside the raw command. */
  label?: string;
  /** Working directory for the spawned process. */
  cwd?: string;
  /**
   * Inherit the child's stdio so it streams live to the terminal. Use this for
   * commands with their own progress UI (e.g. `flutter test`). Because the
   * output goes straight to the terminal it is **not** captured, so `stdout`
   * and `stderr` in the result are empty and the log records only the command
   * and its exit code.
   */
  stream?: boolean;
}

/**
 * Run an external command, append its result to `flutter_fusion.log`, and
 * return the decoded output. This replaces the repeated
 * `new Deno.Command(...).output()` + `TextDecoder` boilerplate.
 */
export async function runCommand(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<CommandResult> {
  const { verbose = false, label, cwd, stream = false } = opts;

  // Streamed mode: inherit stdio so the child renders its own live progress
  // (e.g. flutter test). Output isn't captured here, so we log the invocation
  // and exit code only.
  if (stream) {
    const child = new Deno.Command(cmd, {
      args,
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    const { code } = await child.status;

    const block = `[${timestamp()}]${label ? ` ${label}` : ""}\n` +
      `$ ${cmd} ${args.join(" ")}\n` +
      `exit code: ${code}\n` +
      `--- output streamed to terminal (not captured) ---\n` +
      `${SEPARATOR}\n\n`;
    await appendToLog(block);

    return { code, success: code === 0, stdout: "", stderr: "" };
  }

  const command = new Deno.Command(cmd, { args, cwd });
  const { code, stdout, stderr } = await command.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  const block = `[${timestamp()}]${label ? ` ${label}` : ""}\n` +
    `$ ${cmd} ${args.join(" ")}\n` +
    `exit code: ${code}\n` +
    `--- stdout ---\n${out.trimEnd()}\n` +
    `--- stderr ---\n${err.trimEnd()}\n` +
    `${SEPARATOR}\n\n`;
  await appendToLog(block);

  if (verbose) {
    if (out.trim()) console.log(out);
    if (err.trim()) console.log(err);
  }

  return { code, success: code === 0, stdout: out, stderr: err };
}
