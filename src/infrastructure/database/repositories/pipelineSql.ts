import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { Prisma } from "../../../../generated/prisma/client";

const prismaCode = (error: unknown) => (error as { code?: string } | null)?.code;

/** A unique index refused the write (Prisma P2002). */
export const isUniqueViolation = (error: unknown) => prismaCode(error) === "P2002";

/** A foreign key refused the write (Prisma P2003). */
export const isForeignKeyViolation = (error: unknown) => prismaCode(error) === "P2003";

/** Turns a unique violation into the given AppError; anything else is rethrown as it is. */
export function rethrowUnique(error: unknown, code: ErrorCode): never {
  if (isUniqueViolation(error)) throw new AppError(code);
  throw error;
}

/**
 * Locks the pipeline row for the rest of the transaction (D38, D39), so stage creation, reorder,
 * stage deletion and pipeline deletion on one pipeline run one at a time. False when there is no
 * such pipeline in the organization, which also makes every caller organization-safe.
 */
export async function lockPipeline(
  tx: Prisma.TransactionClient,
  organizationId: string,
  pipelineId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Pipeline"
    WHERE "id" = ${pipelineId} AND "organizationId" = ${organizationId}
    FOR UPDATE`;
  return rows.length > 0;
}
