// iOS build pipeline: build the IPA, validate it, and upload to App Store
// Connect via `xcrun altool`. All command output is captured to
// flutter_fusion.log through `runCommand`.

import * as path from "jsr:@std/path@1.1.6";
import { exists } from "jsr:@std/fs@1.0.24";
import Spinner from "https://deno.land/x/cli_spinners@v0.0.2/mod.ts";
import type { Context } from "./config.ts";
import { runCommand } from "./logger.ts";
import { getTimeDifference, infoStyle, successStyle } from "./util.ts";

export async function buildIos(ctx: Context, startTime: Date): Promise<void> {
  const { config, pubspec, projectRoot } = ctx;

  console.log("%cStarting iOS Build Process...", infoStyle);

  if (!config.APP_STORE_CONNECT_API_KEY_ID) {
    throw new Error(
      "APP_STORE_CONNECT_API_KEY_ID is required and is not set! Set it in your pubspec.yaml or ~/private_keys/pubspec.yaml. Get it from App Store Connect > Users and Access > Keys.",
    );
  }
  if (!config.API_KEY_ISSUER) {
    throw new Error(
      "API_KEY_ISSUER is required and is not set! Set it in your pubspec.yaml or ~/private_keys/pubspec.yaml. Get it from App Store Connect > Users and Access > Keys.",
    );
  }

  const home = Deno.env.get("HOME")!;
  const privateKeysPath = path.join(home, "private_keys");
  if (!(await exists(privateKeysPath))) {
    throw new Error(
      "private_keys folder not found in your home directory! Place your AuthKey .p8 file there.",
    );
  }
  const authKeyPath = path.join(
    privateKeysPath,
    `AuthKey_${config.APP_STORE_CONNECT_API_KEY_ID}.p8`,
  );
  if (!(await exists(authKeyPath))) {
    throw new Error(
      `AuthKey file not found at ${authKeyPath}. Get it from App Store Connect > Users and Access > Keys.`,
    );
  }

  // Build the IPA.
  const buildSpinner = Spinner.getInstance();
  buildSpinner.start("⚒️ Flutter App Build for iOS Started...");
  const build = await runCommand(
    "flutter",
    ["build", "ipa", ...config.build_flags],
    { verbose: config.verbose, label: "flutter build ipa" },
  );
  buildSpinner.setText("");
  buildSpinner.stop();

  if (!build.success) {
    console.error("%c❌ Flutter failed to build the app binary:", "color: red");
    console.error(build.stderr || "Unknown error");
    throw new Error(
      "Flutter was unable to build the app binary. See flutter_fusion.log for details.",
    );
  }
  console.log("%c✅ Flutter App Binary Built Successfully", successStyle);

  const ipaPath = path.join(
    projectRoot,
    "build/ios/ipa/",
    `${pubspec.name}.ipa`,
  );

  // Validate the IPA.
  const validationSpinner = Spinner.getInstance();
  validationSpinner.start("Binary Validation Started...");
  const validate = await runCommand(
    "xcrun",
    [
      "altool",
      "ipa",
      "--validate-app",
      "--type",
      "ios",
      "-f",
      ipaPath,
      "--apiKey",
      config.APP_STORE_CONNECT_API_KEY_ID,
      "--apiIssuer",
      config.API_KEY_ISSUER,
    ],
    { verbose: config.verbose, label: "xcrun altool validate" },
  );
  validationSpinner.setText("");
  validationSpinner.stop();

  if (!validate.success) {
    throw new Error(
      "App Binary Validation Failed. See flutter_fusion.log for details.",
    );
  }
  console.log("%c✅ App Validation Successful", successStyle);

  // Upload to App Store Connect.
  const uploadSpinner = Spinner.getInstance();
  uploadSpinner.setSpinnerType("weather");
  uploadSpinner.start("Upload to App Store Connect Started...");
  const upload = await runCommand(
    "xcrun",
    [
      "altool",
      "--upload-app",
      "--type",
      "ios",
      "-f",
      ipaPath,
      "--apiKey",
      config.APP_STORE_CONNECT_API_KEY_ID,
      "--apiIssuer",
      config.API_KEY_ISSUER,
    ],
    { verbose: config.verbose, label: "xcrun altool upload" },
  );
  uploadSpinner.setText("");
  uploadSpinner.stop();

  if (!upload.success) {
    throw new Error(
      "App upload to App Store Connect failed. See flutter_fusion.log for details.",
    );
  }
  console.log(
    "%c✅ App Successfully Uploaded to App Store Connect!",
    successStyle,
  );

  const version = pubspec.version.split("+")[0];
  const build_ = pubspec.version.split("+")[1];
  console.log(
    `%c🕓 Finished iOS version %c${version}%c build %c${build_}%c in ${
      getTimeDifference(startTime, new Date())
    }`,
    "",
    infoStyle,
    "",
    infoStyle,
    "",
  );
}
