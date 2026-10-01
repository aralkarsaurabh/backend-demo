import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp, TestApp } from "../helpers/fakes";

const orgA: string = randomUUID();
const orgB: string = randomUUID();

async function pipelineWithStages(
  app: TestApp,
  organizationId: string,
  names = ["New Lead", "Contacted", "Demo"],
  pipelineName = "Sales Pipeline",
) {
  const { pipeline } = await app.createPipeline.execute(organizationId, { name: pipelineName });
  const stages = [];
  for (const name of names) {
    stages.push((await app.createPipelineStage.execute(organizationId, pipeline.id, { name })).stage);
  }
  return { pipeline, stages };
}

const stageList = async (app: TestApp, organizationId: string, pipelineId: string) =>
  (await app.getPipeline.execute(organizationId, pipelineId)).pipeline.stages.map((s) => [s.name, s.position]);

describe("CreatePipeline", () => {
  it("creates an empty pipeline in the given organization", async () => {
    const app = buildApp();
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Sales Pipeline", description: "B2B" });

    expect(pipeline).toEqual({
      id: expect.any(String),
      name: "Sales Pipeline",
      description: "B2B",
      stages: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(app.pipelineData.pipelines[0].organizationId).toBe(orgA);
    expect(pipeline).not.toHaveProperty("organizationId");
  });

  it("stores null for an omitted description", async () => {
    const app = buildApp();
    expect((await app.createPipeline.execute(orgA, { name: "Sales" })).pipeline.description).toBeNull();
  });

  it("is PIPELINE_ALREADY_EXISTS for a duplicate name in the organization, but not in another one", async () => {
    const app = buildApp();
    await app.createPipeline.execute(orgA, { name: "Sales" });
    await expect(app.createPipeline.execute(orgA, { name: "Sales" })).rejects.toMatchObject({
      code: "PIPELINE_ALREADY_EXISTS",
    });
    await expect(app.createPipeline.execute(orgB, { name: "Sales" })).resolves.toBeDefined();
  });
});

describe("ListPipelines and GetPipeline", () => {
  it("lists only the organization's pipelines, with their stages in order", async () => {
    const app = buildApp();
    await pipelineWithStages(app, orgA);
    await pipelineWithStages(app, orgB);

    const { pipelines } = await app.listPipelines.execute(orgA);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].stages.map((s) => s.name)).toEqual(["New Lead", "Contacted", "Demo"]);
  });

  it("gets a pipeline, and is PIPELINE_NOT_FOUND for an unknown id and for another organization's pipeline", async () => {
    const app = buildApp();
    const { pipeline } = await pipelineWithStages(app, orgA);
    expect((await app.getPipeline.execute(orgA, pipeline.id)).pipeline.id).toBe(pipeline.id);
    await expect(app.getPipeline.execute(orgA, randomUUID())).rejects.toMatchObject({ code: "PIPELINE_NOT_FOUND" });
    await expect(app.getPipeline.execute(orgB, pipeline.id)).rejects.toMatchObject({ code: "PIPELINE_NOT_FOUND" });
  });
});

describe("UpdatePipeline", () => {
  it("renames, and null clears the description", async () => {
    const app = buildApp();
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Sales", description: "B2B" });
    const renamed = await app.updatePipeline.execute(orgA, pipeline.id, { name: "Enterprise" });
    expect(renamed.pipeline).toMatchObject({ name: "Enterprise", description: "B2B" });
    const cleared = await app.updatePipeline.execute(orgA, pipeline.id, { description: null });
    expect(cleared.pipeline.description).toBeNull();
  });

  it("is PIPELINE_ALREADY_EXISTS for a name another pipeline has, and PIPELINE_NOT_FOUND across organizations", async () => {
    const app = buildApp();
    await app.createPipeline.execute(orgA, { name: "Sales" });
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Support" });
    await expect(app.updatePipeline.execute(orgA, pipeline.id, { name: "Sales" })).rejects.toMatchObject({
      code: "PIPELINE_ALREADY_EXISTS",
    });
    await expect(app.updatePipeline.execute(orgB, pipeline.id, { name: "X" })).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
  });
});

describe("DeletePipeline", () => {
  it("deletes an empty pipeline", async () => {
    const app = buildApp();
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Sales" });
    await app.deletePipeline.execute(orgA, pipeline.id);
    await expect(app.getPipeline.execute(orgA, pipeline.id)).rejects.toMatchObject({ code: "PIPELINE_NOT_FOUND" });
  });

  it("is PIPELINE_NOT_EMPTY while it has stages, and deletes nothing", async () => {
    const app = buildApp();
    const { pipeline } = await pipelineWithStages(app, orgA);
    await expect(app.deletePipeline.execute(orgA, pipeline.id)).rejects.toMatchObject({
      code: "PIPELINE_NOT_EMPTY",
    });
    expect(await stageList(app, orgA, pipeline.id)).toHaveLength(3);
  });

  it("is PIPELINE_NOT_FOUND for another organization's pipeline", async () => {
    const app = buildApp();
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Sales" });
    await expect(app.deletePipeline.execute(orgB, pipeline.id)).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
  });
});

describe("CreatePipelineStage", () => {
  it("appends each stage at the next position, starting at 0", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA);
    expect(stages.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(stages[0]).toEqual({
      id: expect.any(String),
      pipelineId: pipeline.id,
      name: "New Lead",
      position: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("is PIPELINE_STAGE_ALREADY_EXISTS for a duplicate name in the pipeline only", async () => {
    const app = buildApp();
    const { pipeline } = await pipelineWithStages(app, orgA);
    await expect(app.createPipelineStage.execute(orgA, pipeline.id, { name: "Contacted" })).rejects.toMatchObject({
      code: "PIPELINE_STAGE_ALREADY_EXISTS",
    });
    const other = await app.createPipeline.execute(orgA, { name: "Support" });
    await expect(app.createPipelineStage.execute(orgA, other.pipeline.id, { name: "Contacted" })).resolves.toBeDefined();
  });

  it("is PIPELINE_NOT_FOUND for an unknown pipeline and another organization's pipeline", async () => {
    const app = buildApp();
    const { pipeline } = await app.createPipeline.execute(orgA, { name: "Sales" });
    await expect(app.createPipelineStage.execute(orgA, randomUUID(), { name: "X" })).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
    await expect(app.createPipelineStage.execute(orgB, pipeline.id, { name: "X" })).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
  });
});

describe("UpdatePipelineStage", () => {
  it("renames a stage and leaves its position alone", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA);
    const { stage } = await app.updatePipelineStage.execute(orgA, pipeline.id, stages[1].id, { name: "Qualified" });
    expect(stage).toMatchObject({ name: "Qualified", position: 1 });
  });

  it("is PIPELINE_STAGE_ALREADY_EXISTS for a taken name", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA);
    await expect(
      app.updatePipelineStage.execute(orgA, pipeline.id, stages[1].id, { name: "Demo" }),
    ).rejects.toMatchObject({ code: "PIPELINE_STAGE_ALREADY_EXISTS" });
  });

  it("is PIPELINE_STAGE_NOT_FOUND for a stage of another pipeline, and PIPELINE_NOT_FOUND for an unknown pipeline", async () => {
    const app = buildApp();
    const a = await pipelineWithStages(app, orgA);
    const { pipeline: second } = await app.createPipeline.execute(orgA, { name: "Support" });
    await expect(
      app.updatePipelineStage.execute(orgA, second.id, a.stages[0].id, { name: "X" }),
    ).rejects.toMatchObject({ code: "PIPELINE_STAGE_NOT_FOUND" });
    await expect(
      app.updatePipelineStage.execute(orgB, a.pipeline.id, a.stages[0].id, { name: "X" }),
    ).rejects.toMatchObject({ code: "PIPELINE_NOT_FOUND" });
  });
});

describe("DeletePipelineStage", () => {
  it("deletes the stage and closes the gap in the positions", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA, ["a", "b", "c", "d"]);
    await app.deletePipelineStage.execute(orgA, pipeline.id, stages[1].id);
    expect(await stageList(app, orgA, pipeline.id)).toEqual([["a", 0], ["c", 1], ["d", 2]]);
  });

  it("is PIPELINE_STAGE_IN_USE while a lead is in the stage, and deletes nothing", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA);
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[0].id });

    await expect(app.deletePipelineStage.execute(orgA, pipeline.id, stages[0].id)).rejects.toMatchObject({
      code: "PIPELINE_STAGE_IN_USE",
    });
    expect(await stageList(app, orgA, pipeline.id)).toHaveLength(3);
  });

  it("is PIPELINE_STAGE_NOT_FOUND for an unknown stage", async () => {
    const app = buildApp();
    const { pipeline } = await pipelineWithStages(app, orgA);
    await expect(app.deletePipelineStage.execute(orgA, pipeline.id, randomUUID())).rejects.toMatchObject({
      code: "PIPELINE_STAGE_NOT_FOUND",
    });
  });
});

describe("ReorderPipelineStages", () => {
  it("rewrites the positions to the submitted order", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA, ["a", "b", "c", "d"]);
    const ids = stages.map((s) => s.id);

    const { pipeline: reordered } = await app.reorderPipelineStages.execute(orgA, pipeline.id, {
      stageIds: [ids[2], ids[0], ids[1], ids[3]],
    });
    expect(reordered.stages.map((s) => [s.name, s.position])).toEqual([["c", 0], ["a", 1], ["b", 2], ["d", 3]]);
  });

  it("rejects a duplicate, a missing, an extra and a foreign id with INVALID_STAGE_ORDER, changing nothing", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA, ["a", "b", "c"]);
    const other = await pipelineWithStages(app, orgA, ["x"], "Support");
    const [a, b, c] = stages.map((s) => s.id);

    for (const stageIds of [
      [a, a, b],
      [a, b],
      [a, b, c, randomUUID()],
      [a, b, other.stages[0].id],
    ]) {
      await expect(app.reorderPipelineStages.execute(orgA, pipeline.id, { stageIds })).rejects.toMatchObject({
        code: "INVALID_STAGE_ORDER",
      });
    }
    expect(await stageList(app, orgA, pipeline.id)).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });

  it("is PIPELINE_NOT_FOUND for another organization's pipeline", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA);
    await expect(
      app.reorderPipelineStages.execute(orgB, pipeline.id, { stageIds: stages.map((s) => s.id) }),
    ).rejects.toMatchObject({ code: "PIPELINE_NOT_FOUND" });
  });
});

describe("MoveLeadToStage", () => {
  it("moves the lead into the stage without touching its status", async () => {
    const app = buildApp();
    const { stages } = await pipelineWithStages(app, orgA);
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    expect(lead.pipelineStageId).toBeNull();

    const moved = await app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[1].id });
    expect(moved.lead).toMatchObject({ id: lead.id, pipelineStageId: stages[1].id, status: "NEW" });
    expect(moved.lead).not.toHaveProperty("organizationId");

    const again = await app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[1].id });
    expect(again.lead.pipelineStageId).toBe(stages[1].id);
  });

  it("is PIPELINE_STAGE_NOT_FOUND for an unknown stage and a stage of another organization", async () => {
    const app = buildApp();
    const foreign = await pipelineWithStages(app, orgB);
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    for (const pipelineStageId of [randomUUID(), foreign.stages[0].id]) {
      await expect(app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId })).rejects.toMatchObject({
        code: "PIPELINE_STAGE_NOT_FOUND",
      });
    }
    expect((await app.getLead.execute(orgA, lead.id)).lead.pipelineStageId).toBeNull();
  });

  it("is LEAD_NOT_FOUND for an unknown lead and a lead of another organization", async () => {
    const app = buildApp();
    const { stages } = await pipelineWithStages(app, orgA);
    const { lead } = await app.createLead.execute(orgB, { name: "Elsewhere" });
    for (const leadId of [randomUUID(), lead.id]) {
      await expect(
        app.moveLeadToStage.execute(orgA, leadId, { pipelineStageId: stages[0].id }),
      ).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
    }
  });

  it("is LEAD_ALREADY_CONVERTED for a converted lead, which stays where it was", async () => {
    const app = buildApp();
    const { stages } = await pipelineWithStages(app, orgA);
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[0].id });
    await app.convertLead.execute(orgA, lead.id);

    await expect(
      app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[1].id }),
    ).rejects.toMatchObject({ code: "LEAD_ALREADY_CONVERTED" });
    expect((await app.getLead.execute(orgA, lead.id)).lead.pipelineStageId).toBe(stages[0].id);
  });
});

describe("GetPipelineSummary", () => {
  it("counts the leads per stage, with 0 for an empty stage, and totals them", async () => {
    const app = buildApp();
    const { pipeline, stages } = await pipelineWithStages(app, orgA, ["New", "Contacted", "Proposal"]);
    for (const [name, stage] of [["1", 0], ["2", 0], ["3", 1]] as const) {
      const { lead } = await app.createLead.execute(orgA, { name });
      await app.moveLeadToStage.execute(orgA, lead.id, { pipelineStageId: stages[stage].id });
    }
    await app.createLead.execute(orgA, { name: "No stage" });

    const summary = await app.getPipelineSummary.execute(orgA, pipeline.id);
    expect(summary).toEqual({
      pipeline: { id: pipeline.id, name: "Sales Pipeline" },
      stages: [
        { id: stages[0].id, name: "New", position: 0, leadCount: 2 },
        { id: stages[1].id, name: "Contacted", position: 1, leadCount: 1 },
        { id: stages[2].id, name: "Proposal", position: 2, leadCount: 0 },
      ],
      totalLeads: 3,
    });
  });

  it("is PIPELINE_NOT_FOUND for an unknown pipeline and another organization's pipeline", async () => {
    const app = buildApp();
    const { pipeline } = await pipelineWithStages(app, orgA);
    await expect(app.getPipelineSummary.execute(orgA, randomUUID())).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
    await expect(app.getPipelineSummary.execute(orgB, pipeline.id)).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
  });
});
