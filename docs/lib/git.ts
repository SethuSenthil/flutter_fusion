// Git integration: stage all changes, commit, and push.
//
// The commit title/description come from a COMMIT_EDITMSG file in the project
// root. Line 1 is the title; the rest is the body. If line 1 is the literal
// `{VERSION}` token, the current pubspec version is used as the title instead.

import * as path from "jsr:@std/path@1.1.6";
import { exists } from "jsr:@std/fs@1.0.24";
import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { sendNotification } from "./notify.ts";
import { infoStyle, successStyle } from "./util.ts";

const DEFAULT_COMMIT_MESSAGE = "{VERSION} \n COMMIT DESCRIPTION HERE";

/**
 * Validate the git repo and ensure a COMMIT_EDITMSG file exists. Runs early
 * (before the build) so the user can edit their commit message while building.
 * Returns the path to COMMIT_EDITMSG.
 */
export async function ensureCommitMessageFile(ctx: Context): Promise<string> {
  const commitMessagePath = path.join(ctx.projectRoot, "COMMIT_EDITMSG");

  if (!(await exists(path.join(ctx.projectRoot, ".git")))) {
    throw new Error(
      "Git repository not found! Run this in your project root, or disable git in pubspec.yaml / with --git=false.",
    );
  }

  if (!(await exists(commitMessagePath))) {
    await Deno.writeTextFile(commitMessagePath, DEFAULT_COMMIT_MESSAGE);
    console.log(
      "%c⚠️ Git commit message not found. Created a default one. Edit it at COMMIT_EDITMSG while the app is building. 🥂",
      "color: yellow",
    );
  } else {
    const msg = (await Deno.readTextFile(commitMessagePath)).trim();
    if (msg === DEFAULT_COMMIT_MESSAGE.trim() || msg === "") {
      console.log(
        "%c⚠️ Default commit message found. Edit it at COMMIT_EDITMSG while the app is building. 🥂",
        "color: yellow",
      );
    }
  }

  return commitMessagePath;
}

/** Stage all changes, commit with the COMMIT_EDITMSG message, and push. */
export async function commitAndPush(
  ctx: Context,
  commitMessagePath: string,
): Promise<void> {
  const { config, pubspec } = ctx;

  console.log("%cGIT: Staging Changes...", infoStyle);
  const add = await runCommand("git", ["add", "--all"], {
    verbose: config.verbose,
    label: "git add",
  });
  if (!add.success) return;

  const raw = await Deno.readTextFile(commitMessagePath);
  const body = raw.split("\n").slice(1).join("\n"); // everything after line 1
  const title = raw.startsWith("{VERSION}")
    ? pubspec.version.toString()
    : raw.split("\n")[0].substring(0, 72); // git convention: 72-char title

  console.log("%cGIT: Committing Changes...", infoStyle);
  const commit = await runCommand("git", ["commit", "-m", title, "-m", body], {
    verbose: config.verbose,
    label: "git commit",
  });
  if (!commit.success) return;

  console.log("%cGIT: Pushing Changes to Remote...", infoStyle);
  const push = await runCommand("git", ["push", "origin", "main"], {
    verbose: config.verbose,
    label: "git push",
  });
  if (push.success) {
    console.log("%c✅ Pushed the changes to the git remote", successStyle);
    await sendNotification(
      "Flutter Fusion",
      "Completed Successfully!",
      config.verbose,
    );
  }
}
