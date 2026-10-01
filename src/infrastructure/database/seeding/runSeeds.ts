import { readdirSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "../../../../generated/prisma/client";

export interface Seed {
  up(tx: Prisma.TransactionClient): Promise<void>;
}

export interface SeedResult {
  applied: string[];
  skipped: string[];
}

// <14-digit timestamp>_<kebab-name>.ts, same idea as migration folder names.
const SEED_FILE = /^(\d{14}_[a-z0-9-]+)\.(ts|js)$/;

// Arbitrary constant; every runner locks on the same number.
const ADVISORY_LOCK_KEY = 7265100001;

const SEED_TIMEOUT_MS = 60_000;

/**
 * Applies every seed in `seedsDir` that is not yet recorded in
 * `_seed_migrations`, in filename order.
 *
 * Each seed runs in its own transaction together with its tracking row, so a
 * seed that throws leaves neither data nor a row behind. The transaction takes
 * an advisory lock first and re-checks the tracking table, so two runners at
 * once apply each seed exactly once.
 */
export async function runSeeds(options: {
  prisma: PrismaClient;
  seedsDir: string;
  onProgress?: (name: string, status: "applied" | "skipped") => void;
}): Promise<SeedResult> {
  const { prisma, seedsDir, onProgress } = options;

  try {
    await prisma.seedMigration.count();
  } catch {
    throw new Error(
      "The _seed_migrations table is not available. Run `npx prisma migrate deploy` first.",
    );
  }

  const files = readdirSync(seedsDir)
    .filter((file) => SEED_FILE.test(file))
    .sort();

  const result: SeedResult = { applied: [], skipped: [] };

  for (const file of files) {
    const name = SEED_FILE.exec(file)![1];
    const seed = (await import(path.join(seedsDir, file))) as Partial<Seed>;
    if (typeof seed.up !== "function") {
      throw new Error(`Seed ${name} must export an "up" function.`);
    }

    let applied: boolean;
    try {
      applied = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);

          if (await tx.seedMigration.findUnique({ where: { name } })) return false;

          await seed.up!(tx);
          await tx.seedMigration.create({ data: { name } });
          return true;
        },
        { timeout: SEED_TIMEOUT_MS },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Seed ${name} failed and was rolled back: ${reason}`);
    }

    (applied ? result.applied : result.skipped).push(name);
    onProgress?.(name, applied ? "applied" : "skipped");
  }

  return result;
}
