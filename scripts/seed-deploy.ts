import "dotenv/config";
import path from "node:path";
import { createPrismaClient } from "../src/infrastructure/database/prisma";
import { runSeeds } from "../src/infrastructure/database/seeding/runSeeds";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const { applied, skipped } = await runSeeds({
      prisma,
      seedsDir: path.join(__dirname, "..", "prisma", "seeds"),
      onProgress: (name, status) =>
        console.log(status === "applied" ? `applied  ${name}` : `skipped  ${name} (already applied)`),
    });
    console.log(`Done: ${applied.length} applied, ${skipped.length} skipped.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
