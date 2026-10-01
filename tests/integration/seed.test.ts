import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSeeds } from "../../src/infrastructure/database/seeding/runSeeds";
import { bearer, buildIntegrationApp, resetDatabase } from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

const REAL_SEEDS_DIR = path.join(__dirname, "..", "..", "prisma", "seeds");
const ADMIN_SEED = "20261001090000_create-admin-user";
const ADMIN_EMAIL = "boss@example.com";
const ADMIN_PASSWORD = "AdminPass#2026";

const savedEnv = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const scratchDirs: string[] = [];

beforeEach(async () => {
  await resetDatabase(prisma);
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
});

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

afterAll(async () => {
  for (const [key, value] of [["ADMIN_EMAIL", savedEnv.email], ["ADMIN_PASSWORD", savedEnv.password]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await prisma.$disconnect();
});

/** A throwaway seeds folder; files are CommonJS so they load without a TS step. */
function scratchSeeds(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "seeds-"));
  scratchDirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  return dir;
}

describe("create-admin-user seed", () => {
  it("creates an ADMIN with a bcrypt hash and records the seed with a timestamp", async () => {
    const result = await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });

    expect(result.applied).toEqual([ADMIN_SEED]);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(admin).toMatchObject({ role: "ADMIN", name: "Administrator" });
    expect(admin.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(admin.passwordHash).not.toContain(ADMIN_PASSWORD);

    const tracked = await prisma.seedMigration.findUniqueOrThrow({ where: { name: ADMIN_SEED } });
    expect(Date.now() - tracked.appliedAt.getTime()).toBeLessThan(60_000);
  });

  it("lets the seeded admin log in and reach the admin route", async () => {
    await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });

    const res = await api.post("/api/v1/auth/login").send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("ADMIN");

    const list = await api.get("/api/v1/admin/users").set(bearer(res.body.data.tokens.accessToken));
    expect(list.status).toBe(200);
  });

  it("is skipped on a second run and creates no duplicate", async () => {
    await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });
    const again = await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });

    expect(again).toEqual({ applied: [], skipped: [ADMIN_SEED] });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.seedMigration.count()).toBe(1);
  });

  it("normalises the email like registration does", async () => {
    process.env.ADMIN_EMAIL = "  Boss@Example.COM ";
    await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });
    expect(await prisma.user.count({ where: { email: "boss@example.com" } })).toBe(1);
  });

  it("promotes an existing user to ADMIN and leaves their password alone", async () => {
    const existing = await prisma.user.create({
      data: { name: "Already Here", email: ADMIN_EMAIL, passwordHash: "existing-hash" },
    });

    await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.role).toBe("ADMIN");
    expect(after.passwordHash).toBe("existing-hash");
    expect(after.name).toBe("Already Here");
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["ADMIN_EMAIL is missing", { ADMIN_EMAIL: undefined }, /ADMIN_EMAIL and ADMIN_PASSWORD must both be set/],
    ["ADMIN_PASSWORD is missing", { ADMIN_PASSWORD: undefined }, /ADMIN_EMAIL and ADMIN_PASSWORD must both be set/],
    ["ADMIN_PASSWORD is too short", { ADMIN_PASSWORD: "short" }, /not valid.*at least 8 characters/],
    ["ADMIN_EMAIL is not an email", { ADMIN_EMAIL: "not-an-email" }, /not valid.*valid email/],
  ])("fails, creates nothing and records nothing when %s", async (_label, override, message) => {
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    const error = await runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(new RegExp(`^Seed ${ADMIN_SEED} failed and was rolled back`));
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).not.toContain(ADMIN_PASSWORD);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.seedMigration.count()).toBe(0);
  });

  it("applies exactly once when two runners start at the same time", async () => {
    const results = await Promise.all([
      runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR }),
      runSeeds({ prisma, seedsDir: REAL_SEEDS_DIR }),
    ]);

    expect(results.flatMap((r) => r.applied)).toEqual([ADMIN_SEED]);
    expect(results.flatMap((r) => r.skipped)).toEqual([ADMIN_SEED]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.seedMigration.count()).toBe(1);
  });
});

describe("seed runner", () => {
  it("applies only the unapplied seeds, in filename order, and ignores files that are not seeds", async () => {
    const dir = scratchSeeds({
      "20260101000002_second.js": `exports.up = async (tx) => { await tx.user.create({ data: { name: "2", email: "two@t.local", passwordHash: "x" } }); };`,
      "20260101000001_first.js": `exports.up = async (tx) => { await tx.user.create({ data: { name: "1", email: "one@t.local", passwordHash: "x" } }); };`,
      "helper.js": `throw new Error("not a seed, must never be loaded");`,
      "README.md": "ignored",
    });

    const first = await runSeeds({ prisma, seedsDir: dir });
    expect(first.applied).toEqual(["20260101000001_first", "20260101000002_second"]);

    // a new seed file later runs on its own
    writeFileSync(
      path.join(dir, "20260101000003_third.js"),
      `exports.up = async (tx) => { await tx.user.create({ data: { name: "3", email: "three@t.local", passwordHash: "x" } }); };`,
    );
    const second = await runSeeds({ prisma, seedsDir: dir });
    expect(second).toEqual({
      applied: ["20260101000003_third"],
      skipped: ["20260101000001_first", "20260101000002_second"],
    });
    expect(await prisma.user.count()).toBe(3);
  });

  it("reports progress as it goes", async () => {
    const dir = scratchSeeds({ "20260101000001_noop.js": `exports.up = async () => {};` });
    const events: string[] = [];
    await runSeeds({ prisma, seedsDir: dir, onProgress: (n, s) => events.push(`${s}:${n}`) });
    await runSeeds({ prisma, seedsDir: dir, onProgress: (n, s) => events.push(`${s}:${n}`) });
    expect(events).toEqual(["applied:20260101000001_noop", "skipped:20260101000001_noop"]);
  });

  it("rolls a failing seed back completely and keeps earlier seeds applied", async () => {
    const dir = scratchSeeds({
      "20260101000001_good.js": `exports.up = async (tx) => { await tx.user.create({ data: { name: "g", email: "good@t.local", passwordHash: "x" } }); };`,
      "20260101000002_half-done.js": `exports.up = async (tx) => {
        await tx.user.create({ data: { name: "h", email: "half@t.local", passwordHash: "x" } });
        throw new Error("boom after writing");
      };`,
      "20260101000003_never-reached.js": `exports.up = async (tx) => { await tx.user.create({ data: { name: "n", email: "never@t.local", passwordHash: "x" } }); };`,
    });

    await expect(runSeeds({ prisma, seedsDir: dir })).rejects.toThrow(
      "Seed 20260101000002_half-done failed and was rolled back: boom after writing",
    );

    expect((await prisma.user.findMany()).map((u) => u.email)).toEqual(["good@t.local"]);
    expect((await prisma.seedMigration.findMany()).map((s) => s.name)).toEqual(["20260101000001_good"]);

    // The broken seed was never applied, so it is replaced by a new seed file
    // (seeds are never edited in place).
    rmSync(path.join(dir, "20260101000002_half-done.js"));
    writeFileSync(path.join(dir, "20260101000002_fixed.js"), `exports.up = async () => {};`);
    const retry = await runSeeds({ prisma, seedsDir: dir });
    expect(retry.skipped).toEqual(["20260101000001_good"]);
    expect(retry.applied).toEqual(["20260101000002_fixed", "20260101000003_never-reached"]);
  });

  it("rejects a seed that does not export up()", async () => {
    const dir = scratchSeeds({ "20260101000001_no-up.js": `exports.something = 1;` });
    await expect(runSeeds({ prisma, seedsDir: dir })).rejects.toThrow(
      'Seed 20260101000001_no-up must export an "up" function.',
    );
    expect(await prisma.seedMigration.count()).toBe(0);
  });

  it("runs a seed once even when two runners race on a slow seed", async () => {
    const dir = scratchSeeds({
      "20260101000001_slow.js": `exports.up = async (tx) => {
        await new Promise((r) => setTimeout(r, 300));
        await tx.user.create({ data: { name: "s", email: "slow@t.local", passwordHash: "x" } });
      };`,
    });
    const results = await Promise.all([runSeeds({ prisma, seedsDir: dir }), runSeeds({ prisma, seedsDir: dir })]);
    expect(results.flatMap((r) => r.applied)).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("fails with a clear message when migrations have not been applied", async () => {
    const dir = scratchSeeds({});
    const broken = {
      seedMigration: { count: async () => { throw new Error("relation does not exist"); } },
    } as unknown as typeof prisma;
    await expect(runSeeds({ prisma: broken, seedsDir: dir })).rejects.toThrow(
      "Run `npx prisma migrate deploy` first.",
    );
  });
});

describe("npm run seed:deploy (the real script)", () => {
  const run = (extraEnv: Record<string, string> = {}) =>
    spawnSync("npx", ["tsx", "scripts/seed-deploy.ts"], {
      cwd: path.join(__dirname, "..", ".."),
      env: { ...process.env, ADMIN_EMAIL, ADMIN_PASSWORD, ...extraEnv },
      encoding: "utf8",
      timeout: 60_000,
    });

  it("applies the pending seed, then skips it on the next run", async () => {
    const first = run();
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`applied  ${ADMIN_SEED}`);
    expect(first.stdout).toContain("Done: 1 applied, 0 skipped.");

    const second = run();
    expect(second.status).toBe(0);
    expect(second.stdout).toContain(`skipped  ${ADMIN_SEED} (already applied)`);
    expect(second.stdout).toContain("Done: 0 applied, 1 skipped.");

    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL, role: "ADMIN" } })).toBe(1);
  });

  it("exits non-zero with a readable message and no stack trace when the admin settings are missing", async () => {
    const result = run({ ADMIN_EMAIL: "", ADMIN_PASSWORD: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ADMIN_EMAIL and ADMIN_PASSWORD must both be set");
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(await prisma.seedMigration.count()).toBe(0);
  });
});
