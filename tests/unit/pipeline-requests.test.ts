import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPipelineRequestSchema,
  createStageRequestSchema,
  moveLeadRequestSchema,
  reorderStagesRequestSchema,
  updatePipelineRequestSchema,
  updateStageRequestSchema,
} from "../../src/application/dto/pipeline/PipelineRequests";

describe("createPipelineRequestSchema", () => {
  it("accepts a name alone and trims it", () => {
    expect(createPipelineRequestSchema.parse({ name: "  Sales Pipeline " })).toEqual({ name: "Sales Pipeline" });
  });

  it("accepts a description", () => {
    expect(createPipelineRequestSchema.parse({ name: "Sales", description: " B2B " })).toEqual({
      name: "Sales",
      description: "B2B",
    });
  });

  it("rejects an empty or too long name or description and any server-owned field", () => {
    for (const body of [
      {},
      { name: "   " },
      { name: "x".repeat(101) },
      { name: "A", description: "" },
      { name: "A", description: "x".repeat(501) },
      { name: "A", organizationId: randomUUID() },
      { name: "A", id: randomUUID() },
      { name: "A", stages: [] },
    ]) {
      expect(createPipelineRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("updatePipelineRequestSchema", () => {
  it("needs at least one field and lets null clear the description", () => {
    expect(updatePipelineRequestSchema.safeParse({}).success).toBe(false);
    expect(updatePipelineRequestSchema.parse({ description: null })).toEqual({ description: null });
    expect(updatePipelineRequestSchema.parse({ name: " New " })).toEqual({ name: "New" });
  });

  it("rejects a null name and unknown fields", () => {
    expect(updatePipelineRequestSchema.safeParse({ name: null }).success).toBe(false);
    expect(updatePipelineRequestSchema.safeParse({ name: "A", organizationId: randomUUID() }).success).toBe(false);
  });
});

describe("createStageRequestSchema and updateStageRequestSchema", () => {
  it("take only a trimmed name: a position is never accepted", () => {
    expect(createStageRequestSchema.parse({ name: " Demo " })).toEqual({ name: "Demo" });
    expect(updateStageRequestSchema.parse({ name: "Demo" })).toEqual({ name: "Demo" });
    for (const schema of [createStageRequestSchema, updateStageRequestSchema]) {
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ name: "" }).success).toBe(false);
      expect(schema.safeParse({ name: "A", position: 937 }).success).toBe(false);
      expect(schema.safeParse({ name: "A", pipelineId: randomUUID() }).success).toBe(false);
    }
  });
});

describe("reorderStagesRequestSchema", () => {
  it("takes a non-empty list of ids, at most 100", () => {
    const ids = [randomUUID(), randomUUID()];
    expect(reorderStagesRequestSchema.parse({ stageIds: ids })).toEqual({ stageIds: ids });
    expect(reorderStagesRequestSchema.safeParse({ stageIds: [] }).success).toBe(false);
    expect(reorderStagesRequestSchema.safeParse({ stageIds: ["nope"] }).success).toBe(false);
    expect(reorderStagesRequestSchema.safeParse({ stageIds: Array.from({ length: 101 }, () => randomUUID()) }).success).toBe(false);
    expect(reorderStagesRequestSchema.safeParse({}).success).toBe(false);
    expect(reorderStagesRequestSchema.safeParse({ stageIds: ids, extra: 1 }).success).toBe(false);
  });
});

describe("moveLeadRequestSchema", () => {
  it("takes exactly one stage id", () => {
    const id = randomUUID();
    expect(moveLeadRequestSchema.parse({ pipelineStageId: id })).toEqual({ pipelineStageId: id });
    for (const body of [{}, { pipelineStageId: "nope" }, { pipelineStageId: null }, { pipelineStageId: id, status: "NEW" }]) {
      expect(moveLeadRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});
