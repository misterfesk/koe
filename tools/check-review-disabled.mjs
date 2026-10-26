/** Explicit alternate-build regression. Restores the normal build afterwards. */
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markers = [
  "Fictional scenario",
  "Reset this scenario",
  "Every candidate feature, and scenarios to test them in.",
  "Preview an error (review)",
];
async function scan(folder) {
  let count = 0;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) count += await scan(path);
    else if (entry.name.endsWith(".js")) {
      count++;
      const source = await readFile(path, "utf8");
      for (const marker of markers)
        if (source.includes(marker))
          throw new Error(`Review tooling remains in ${path}: ${marker}`);
    }
  }
  return count;
}
function build(flag) {
  const result = spawnSync(
    process.execPath,
    [join(web, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: web,
      env: { ...process.env, NEXT_PUBLIC_REVIEW_TOOLS: flag },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Build with review tools=${flag} failed (${result.status})`,
    );
}
if (process.argv[2]) {
  console.log(
    `Checked ${await scan(resolve(process.argv[2], "static/chunks"))} chunks: review controls absent.`,
  );
} else {
  let failure;
  try {
    build("false");
    const count = await scan(join(web, ".next/static/chunks"));
    if (!count) throw new Error("No browser chunks found");
    console.log(
      `PASS: review-disabled build excludes tooling from all ${count} browser chunks.`,
    );
  } catch (error) {
    failure = error;
  } finally {
    build(process.env.NEXT_PUBLIC_REVIEW_TOOLS ?? "true");
  }
  if (failure) throw failure;
}
