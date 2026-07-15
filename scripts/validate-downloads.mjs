#!/usr/bin/env node
/**
 * Fail the Docker/build if download artifacts are missing or Git LFS pointers.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "downloads");

const checks = [
  { name: "interview-helper.apk", minBytes: 5_000_000 },
  { name: "InterviewHelperCapture.exe", minBytes: 5_000_000 },
  { name: "interview-helper-windows.zip", minBytes: 5_000_000 },
];

let failed = false;

for (const { name, minBytes } of checks) {
  const filePath = path.join(dir, name);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing download: ${name}`);
    failed = true;
    continue;
  }

  const size = fs.statSync(filePath).size;
  if (size < minBytes) {
    const head = fs.readFileSync(filePath, "utf8").slice(0, 80);
    if (head.includes("git-lfs")) {
      console.error(`${name} is a Git LFS pointer (${size} bytes), not the real file.`);
    } else {
      console.error(`${name} is too small (${size} bytes, expected >= ${minBytes}).`);
    }
    failed = true;
    continue;
  }

  console.log(`OK ${name} (${(size / 1_000_000).toFixed(1)} MB)`);
}

if (failed) {
  process.exit(1);
}
