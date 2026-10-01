import { PipelineWithStages } from "../../../domain/entities/Pipeline";
import {
  CreatePipelineData,
  PipelineRepository,
  PipelineSummary,
  UpdatePipelineData,
} from "../../../domain/repositories/PipelineRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { Prisma } from "../../../../generated/prisma/client";
import type { PrismaClient } from "../prisma";
import { lockPipeline, rethrowUnique } from "./pipelineSql";

const withStages = { stages: { orderBy: { position: "asc" } } } satisfies Prisma.PipelineInclude;

export class PrismaPipelineRepository implements PipelineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(organizationId: string, data: CreatePipelineData): Promise<PipelineWithStages> {
    try {
      return await this.prisma.pipeline.create({ data: { ...data, organizationId }, include: withStages });
    } catch (error) {
      return rethrowUnique(error, ErrorCode.PIPELINE_ALREADY_EXISTS);
    }
  }

  findById(organizationId: string, pipelineId: string): Promise<PipelineWithStages | null> {
    return this.prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId }, include: withStages });
  }

  findMany(organizationId: string): Promise<PipelineWithStages[]> {
    return this.prisma.pipeline.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: withStages,
    });
  }

  async update(
    organizationId: string,
    pipelineId: string,
    data: UpdatePipelineData,
  ): Promise<PipelineWithStages | null> {
    try {
      const { count } = await this.prisma.pipeline.updateMany({ where: { id: pipelineId, organizationId }, data });
      if (count === 0) return null;
    } catch (error) {
      return rethrowUnique(error, ErrorCode.PIPELINE_ALREADY_EXISTS);
    }
    return this.findById(organizationId, pipelineId);
  }

  /** Under the pipeline lock, so a stage cannot be added between the check and the delete (D41). */
  delete(organizationId: string, pipelineId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockPipeline(tx, organizationId, pipelineId))) return false;

      const stages = await tx.pipelineStage.count({ where: { pipelineId } });
      if (stages > 0) throw new AppError(ErrorCode.PIPELINE_NOT_EMPTY);

      const { count } = await tx.pipeline.deleteMany({ where: { id: pipelineId, organizationId } });
      return count > 0;
    });
  }

  /**
   * The database counts (D43). The join repeats the organization id, so a lead of another
   * organization is never counted even if it somehow pointed at one of these stages.
   */
  async getSummary(organizationId: string, pipelineId: string): Promise<PipelineSummary | null> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId },
      select: { id: true, name: true },
    });
    if (!pipeline) return null;

    const stages = await this.prisma.$queryRaw<PipelineSummary["stages"]>`
      SELECT s."id", s."name", s."position", COUNT(l."id")::int AS "leadCount"
      FROM "PipelineStage" s
      LEFT JOIN "Lead" l ON l."pipelineStageId" = s."id" AND l."organizationId" = ${organizationId}
      WHERE s."pipelineId" = ${pipeline.id}
      GROUP BY s."id"
      ORDER BY s."position"`;

    return { pipeline, stages, totalLeads: stages.reduce((total, stage) => total + stage.leadCount, 0) };
  }
}
