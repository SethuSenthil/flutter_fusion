// Desktop notifications. macOS only for now; a no-op elsewhere.

import { runCommand } from "./logger.ts";

/**
 * Show a desktop notification. On macOS this shells out to `osascript`.
 * @param title   Notification title (bold line).
 * @param message Notification body.
 */
export async function sendNotification(
  title: string,
  message: string,
  verbose = false,
): Promise<void> {
  if (Deno.build.os !== "darwin") return;
  try {
    const script = `display notification "${message}" with title "${title}"`;
    await runCommand("osascript", ["-e", script], { verbose, label: "notify" });
  } catch {
    console.log("Error sending notification");
  }
}
