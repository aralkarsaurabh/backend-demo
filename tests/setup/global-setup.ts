import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveTestDatabaseUrl } from "./test-database";

export default function setup() {
  const testUrl = resolveTestDatabaseUrl();

  // From here on, everything in the test run (workers, spawned scripts) that
  // reads DATABASE_URL gets the test database, never the dev one.
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = testUrl;

  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: path.join(__dirname, "..", ".."),
      env: process.env,
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer });
    throw new Error(
      `prisma migrate deploy failed on the test database:\n${output.stdout ?? ""}${output.stderr ?? ""}`,
    );
  }
}
