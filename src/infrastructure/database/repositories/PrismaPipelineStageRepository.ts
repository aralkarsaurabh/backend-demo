import { PipelineStage } from "../../../domain/entities/Pipeline";
import {
  CreatePipelineStageData,
  PipelineStageRepository,
  UpdatePipelineStageData,
} from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { PrismaClient } from "../prisma";
import { isForeignKeyViolation, lockPipeline, rethrowUnique } from "./pipelineSql";

export class PrismaPipelineStageRepository implements PipelineStageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** The pipeline lock makes read-next-position then insert atomic; the unique index is the backstop (D39). */
  async create(
    organizationId: string,
    pipelineId: string,
    data: CreatePipelineStageData,
  ): Promise<PipelineStage | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await lockPipeline(tx, organizationId, pipelineId))) return null;

        const { _max } = await tx.pipelineStage.aggregate({ where: { pipelineId }, _max: { position: true } });
        return tx.pipelineStage.create({
          data: { pipelineId, name: data.name, position: (_max.position ?? -1) + 1 },
        });
      });
    } catch (error) {
      return rethrowUnique(error, ErrorCode.PIPELINE_STAGE_ALREADY_EXISTS);
    }
  }

  /** The stage is reached through its pipeline's organization (D34). */
  findById(organizationId: string, stageId: string): Promise<PipelineStage | null> {
    return this.prisma.pipelineStage.findFirst({ where: { id: stageId, pipeline: { organizationId } } });
  }

  async update(
    organizationId: string,
    pipelineId: string,
    stageId: string,
    data: UpdatePipelineStageData,
  ): Promise<PipelineStage | null> {
    const where = { id: stageId, pipelineId, pipeline: { organizationId } };
    try {
      const { count } = await this.prisma.pipelineStage.updateMany({ where, data: { name: data.name } });
      if (count === 0) return null;
    } catch (error) {
      return rethrowUnique(error, ErrorCode.PIPELINE_STAGE_ALREADY_EXISTS);
    }
    return this.prisma.pipelineStage.findFirst({ where });
  }

  /**
   * Under the pipeline lock. The foreign key from Lead (NO ACTION) refuses to delete a stage that
   * holds a lead, whether the lead was there already or was moved in concurrently, and that is
   * mapped to PIPELINE_STAGE_IN_USE (D41). The later positions are closed up in two phases
   * (negative first): the unique (pipelineId, position) index is checked row by row, so a plain
   * `position - 1` could collide depending on the order the rows are visited.
   */
  async delete(organizationId: string, pipelineId: string, stageId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await lockPipeline(tx, organizationId, pipelineId))) return false;

        const stage = await tx.pipelineStage.findFirst({
          where: { id: stageId, pipelineId },
          select: { position: true },
        });
        if (!stage) return false;

        await tx.pipelineStage.delete({ where: { id: stageId } });

        await tx.$executeRaw`
          UPDATE "PipelineStage" SET "position" = -"position" - 1
          WHERE "pipelineId" = ${pipelineId} AND "position" > ${stage.position}`;
        await tx.$executeRaw`
          UPDATE "PipelineStage" SET "position" = -"position" - 2
          WHERE "pipelineId" = ${pipelineId} AND "position" < 0`;
        return true;
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new AppError(ErrorCode.PIPELINE_STAGE_IN_USE);
      throw error;
    }
  }

  /**
   * One transaction under the pipeline lock (D38). The ids must be exactly the pipeline's stages,
   * each once, otherwise nothing is written. The positions are then rewritten in two phases
   * (every row to a distinct negative value, then to its final one), because the unique
   * (pipelineId, position) index is checked row by row and swapping positions would collide.
   */
  reorder(organizationId: string, pipelineId: string, stageIds: string[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockPipeline(tx, organizationId, pipelineId))) return false;

      const current = await tx.pipelineStage.findMany({ where: { pipelineId }, select: { id: true } });
      const submitted = new Set(stageIds);
      const isExactPermutation =
        submitted.size === stageIds.length &&
        stageIds.length === current.length &&
        current.every((stage) => submitted.has(stage.id));
      if (!isExactPermutation) throw new AppError(ErrorCode.INVALID_STAGE_ORDER);

      await tx.$executeRaw`UPDATE "PipelineStage" SET "position" = -"position" - 1 WHERE "pipelineId" = ${pipelineId}`;
      for (const [position, id] of stageIds.entries()) {
        await tx.pipelineStage.update({ where: { id }, data: { position } });
      }
      return true;
    });
  }
}
