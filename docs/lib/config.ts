// Project detection and configuration loading.
//
// Resolves the Flutter project root (walking up out of a common subfolder if
// needed), reads the project's pubspec.yaml plus the optional global
// ~/private_keys/pubspec.yaml, merges them with CLI flags, and returns a single
// Context object consumed by the rest of the pipeline.

import * as path from "jsr:@std/path@1.1.6";
import { exists } from "jsr:@std/fs@1.0.24";
import { parseArgs } from "jsr:@std/cli@1.0.32/parse-args";
import { parse as parseYaml } from "jsr:@std/yaml@1.2.0";
import { warnStyle } from "./util.ts";

export interface FusionConfig {
  verbose: boolean;
  build_flags: string[];
  APP_STORE_CONNECT_API_KEY_ID?: string;
  API_KEY_ISSUER?: string;
  ios: boolean;
  android: boolean;
  web: boolean;
  auto_increment_build: boolean;
  increment_version: boolean;
  git: boolean;
  spm_update_on_build: boolean;
  spm_outdated_on_build: boolean;
  spm_workspace?: string;
  spm_scheme?: string;
}

export interface Context {
  projectRoot: string;
  pubspecPath: string;
  /** Positional CLI arguments, e.g. ["spm", "up"]. */
  positionals: string[];
  // deno-lint-ignore no-explicit-any
  pubspec: any;
  // deno-lint-ignore no-explicit-any
  globalPubSpec: any;
  config: FusionConfig;
}

// Common Flutter subfolders; if the CLI is invoked from one of these we walk up
// to the parent project directory.
const POPULAR_SUBFOLDERS = [
  "ios",
  "android",
  "web",
  "lib",
  "test",
  "windows",
  "linux",
  "assets",
  "fonts",
];

/** Coerce a CLI flag value into a boolean, honoring `--flag=false`/`--flag=0`. */
function asBool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v !== "false" && v !== "0" && v !== "";
  }
  return Boolean(value);
}

function resolveProjectRoot(cwd: string): string {
  const currentFolderName = path.basename(cwd);
  if (POPULAR_SUBFOLDERS.includes(currentFolderName)) {
    console.log(
      `📁 Detected ${currentFolderName} folder. Going to parent Flutter project folder...`,
    );
    return path.dirname(cwd);
  }
  return cwd;
}

export async function loadContext(): Promise<Context> {
  const args = parseArgs(Deno.args);
  const projectRoot = resolveProjectRoot(Deno.cwd());

  const pubspecPath = path.join(projectRoot, "pubspec.yaml");
  if (!(await exists(pubspecPath))) {
    throw new Error(
      "pubspec.yaml not found! Please make sure you are running this command in the root directory of your Flutter project.",
    );
  }
  // deno-lint-ignore no-explicit-any
  const pubspec: any = parseYaml(await Deno.readTextFile(pubspecPath));

  // Optional global config in ~/private_keys/pubspec.yaml.
  const home = Deno.env.get("HOME");
  const globalPubspecPath = home
    ? path.join(home, "private_keys", "pubspec.yaml")
    : "";
  // deno-lint-ignore no-explicit-any
  let globalPubSpec: any = {};
  if (globalPubspecPath && (await exists(globalPubspecPath))) {
    globalPubSpec = parseYaml(await Deno.readTextFile(globalPubspecPath)) ?? {};
  } else {
    console.log(
      "%c⚠️ It is recommended to create a global pubspec.yaml in ~/private_keys for shared Flutter Fusion settings.",
      warnStyle,
    );
  }

  const ff = pubspec?.flutter_fusion ?? {};
  const gff = globalPubSpec?.flutter_fusion ?? {};

  const config: FusionConfig = {
    verbose: ff.verbose ?? gff.verbose ?? false,
    build_flags: ff.build_flags ?? [],
    APP_STORE_CONNECT_API_KEY_ID: ff.APP_STORE_CONNECT_API_KEY_ID ??
      gff.APP_STORE_CONNECT_API_KEY_ID,
    API_KEY_ISSUER: ff.API_KEY_ISSUER ?? gff.API_KEY_ISSUER,
    ios: ff.ios ?? false,
    android: ff.android ?? false,
    web: ff.web ?? false,
    auto_increment_build: asBool(args["increment-build"]) ??
      ff.auto_increment_build ?? gff.auto_increment_build ?? false,
    increment_version: asBool(args["increment-version"]) ?? false,
    git: asBool(args.git) ?? ff.git ?? false,
    spm_update_on_build: ff.spm_update_on_build ?? gff.spm_update_on_build ??
      false,
    spm_outdated_on_build: ff.spm_outdated_on_build ??
      gff.spm_outdated_on_build ?? false,
    spm_workspace: ff.spm_workspace ?? gff.spm_workspace,
    spm_scheme: ff.spm_scheme ?? gff.spm_scheme,
  };

  const positionals = args._.map(String);

  return {
    projectRoot,
    pubspecPath,
    positionals,
    pubspec,
    globalPubSpec,
    config,
  };
}
