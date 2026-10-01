import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaLeadRepository } from "../../src/infrastructure/database/repositories/PrismaLeadRepository";
import { PrismaPipelineRepository } from "../../src/infrastructure/database/repositories/PrismaPipelineRepository";
import { PrismaPipelineStageRepository } from "../../src/infrastructure/database/repositories/PrismaPipelineStageRepository";
import { resetDatabase } from "../helpers/integration";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const pipelines = new PrismaPipelineRepository(prisma);
const stages = new PrismaPipelineStageRepository(prisma);
const leads = new PrismaLeadRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newOrg = (name = "Acme") =>
  prisma.organization.create({ data: { name, slug: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}` } });

/** A pipeline in `organizationId` with one stage per name, created through the repositories. */
async function pipelineWith(organizationId: string, names: string[] = [], name = "Sales") {
  const pipeline = await pipelines.create(organizationId, { name });
  const created = [];
  for (const stageName of names) created.push((await stages.create(organizationId, pipeline.id, { name: stageName }))!);
  return { pipeline, stages: created };
}

const order = async (organizationId: string, pipelineId: string) =>
  (await pipelines.findById(organizationId, pipelineId))!.stages.map((s) => [s.name, s.position]);

describe("PrismaPipelineRepository: organization scoping", () => {
  it("create() stores the pipeline in the organization with no stages and a null description", async () => {
    const org = await newOrg();
    expect(await pipelines.create(org.id, { name: "Sales" })).toMatchObject({
      organizationId: org.id,
      name: "Sales",
      description: null,
      stages: [],
    });
  });

  it("findById(), findMany(), update() and delete() only reach the organization's own pipelines", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { pipeline } = await pipelineWith(a.id);
    await pipelineWith(b.id, [], "Other");

    expect(await pipelines.findById(b.id, pipeline.id)).toBeNull();
    expect((await pipelines.findMany(a.id)).map((p) => p.name)).toEqual(["Sales"]);
    expect(await pipelines.update(b.id, pipeline.id, { name: "Hacked" })).toBeNull();
    expect(await pipelines.delete(b.id, pipeline.id)).toBe(false);
    expect((await pipelines.findById(a.id, pipeline.id))?.name).toBe("Sales");
  });

  it("update() changes the name and clears the description with null", async () => {
    const org = await newOrg();
    const created = await pipelines.create(org.id, { name: "Sales", description: "B2B" });
    expect(await pipelines.update(org.id, created.id, { name: "Enterprise" })).toMatchObject({
      name: "Enterprise",
      description: "B2B",
    });
    expect((await pipelines.update(org.id, created.id, { description: null }))?.description).toBeNull();
  });
});

describe("PrismaPipelineRepository: unique names", () => {
  it("rejects a duplicate pipeline name in an organization, on create and on update, but not across organizations", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    await pipelineWith(a.id);
    await expect(pipelines.create(a.id, { name: "Sales" })).rejects.toMatchObject({ code: "PIPELINE_ALREADY_EXISTS" });

    const second = await pipelines.create(a.id, { name: "Support" });
    await expect(pipelines.update(a.id, second.id, { name: "Sales" })).rejects.toMatchObject({
      code: "PIPELINE_ALREADY_EXISTS",
    });
    await expect(pipelines.create(b.id, { name: "Sales" })).resolves.toBeDefined();
  });

  it("is enforced by the database itself, not only by the repository", async () => {
    const org = await newOrg();
    await pipelineWith(org.id);
    await expect(prisma.pipeline.create({ data: { organizationId: org.id, name: "Sales" } })).rejects.toThrow();
  });
});

describe("PrismaPipelineStageRepository: create", () => {
  it("appends each stage at the next position, starting at 0", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b", "c"]);
    expect(created.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(await order(org.id, pipeline.id)).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });

  it("gives concurrent creates distinct, contiguous positions (the pipeline row lock)", async () => {
    const org = await newOrg();
    const { pipeline } = await pipelineWith(org.id);
    const names = ["s1", "s2", "s3", "s4", "s5", "s6"];
    await Promise.all(names.map((name) => stages.create(org.id, pipeline.id, { name })));

    const positions = (await pipelines.findById(org.id, pipeline.id))!.stages.map((s) => s.position);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns null for a pipeline of another organization and creates nothing", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { pipeline } = await pipelineWith(a.id);
    expect(await stages.create(b.id, pipeline.id, { name: "X" })).toBeNull();
    expect(await prisma.pipelineStage.count()).toBe(0);
  });

  it("rejects a duplicate stage name within the pipeline only", async () => {
    const org = await newOrg();
    const { pipeline } = await pipelineWith(org.id, ["a"]);
    await expect(stages.create(org.id, pipeline.id, { name: "a" })).rejects.toMatchObject({
      code: "PIPELINE_STAGE_ALREADY_EXISTS",
    });
    const other = await pipelineWith(org.id, ["a"], "Support");
    expect(other.stages[0].name).toBe("a");
  });

  it("the database refuses a duplicate (pipelineId, position) and a duplicate (pipelineId, name)", async () => {
    const org = await newOrg();
    const { pipeline } = await pipelineWith(org.id, ["a"]);
    await expect(
      prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: "other", position: 0 } }),
    ).rejects.toThrow();
    await expect(
      prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: "a", position: 5 } }),
    ).rejects.toThrow();
  });
});

describe("PrismaPipelineStageRepository: findById and update", () => {
  it("findById() reaches a stage only through its own organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { stages: created } = await pipelineWith(a.id, ["x"]);
    expect((await stages.findById(a.id, created[0].id))?.name).toBe("x");
    expect(await stages.findById(b.id, created[0].id)).toBeNull();
  });

  it("update() renames within the pipeline, never changes the position, and refuses a taken name", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b"]);
    expect(await stages.update(org.id, pipeline.id, created[1].id, { name: "z" })).toMatchObject({
      name: "z",
      position: 1,
    });
    await expect(stages.update(org.id, pipeline.id, created[1].id, { name: "a" })).rejects.toMatchObject({
      code: "PIPELINE_STAGE_ALREADY_EXISTS",
    });
  });

  it("update() is null for another organization or another pipeline", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const first = await pipelineWith(a.id, ["a"]);
    const second = await pipelineWith(a.id, [], "Support");
    expect(await stages.update(b.id, first.pipeline.id, first.stages[0].id, { name: "z" })).toBeNull();
    expect(await stages.update(a.id, second.pipeline.id, first.stages[0].id, { name: "z" })).toBeNull();
    expect((await stages.findById(a.id, first.stages[0].id))?.name).toBe("a");
  });
});

describe("PrismaPipelineStageRepository: reorder", () => {
  it("rewrites the positions, even a full reversal that would collide row by row", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b", "c", "d"]);
    const ids = created.map((s) => s.id);

    expect(await stages.reorder(org.id, pipeline.id, [...ids].reverse())).toBe(true);
    expect(await order(org.id, pipeline.id)).toEqual([["d", 0], ["c", 1], ["b", 2], ["a", 3]]);
  });

  it("rejects a duplicate, a missing, an extra and a foreign id, leaving the order unchanged", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b", "c"]);
    const other = await pipelineWith(org.id, ["x"], "Support");
    const [a, b, c] = created.map((s) => s.id);

    for (const ids of [[a, a, b], [a, b], [a, b, c, randomUUID()], [a, b, other.stages[0].id]]) {
      await expect(stages.reorder(org.id, pipeline.id, ids)).rejects.toMatchObject({ code: "INVALID_STAGE_ORDER" });
    }
    expect(await order(org.id, pipeline.id)).toEqual([["a", 0], ["b", 1], ["c", 2]]);
    expect(await order(org.id, other.pipeline.id)).toEqual([["x", 0]]);
  });

  it("is false, changing nothing, for a pipeline of another organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { pipeline, stages: created } = await pipelineWith(a.id, ["a", "b"]);
    expect(await stages.reorder(b.id, pipeline.id, created.map((s) => s.id).reverse())).toBe(false);
    expect(await order(a.id, pipeline.id)).toEqual([["a", 0], ["b", 1]]);
  });
});

describe("PrismaPipelineStageRepository: delete", () => {
  it("deletes the stage and closes the gap, in order, without hitting the unique position", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b", "c", "d", "e"]);
    expect(await stages.delete(org.id, pipeline.id, created[1].id)).toBe(true);
    expect(await order(org.id, pipeline.id)).toEqual([["a", 0], ["c", 1], ["d", 2], ["e", 3]]);
  });

  it("closes the gap when the rows were stored in descending position order", async () => {
    const org = await newOrg();
    const pipeline = await pipelines.create(org.id, { name: "Sales" });
    const rows = [];
    for (const position of [4, 3, 2, 1, 0]) {
      rows.push(
        await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: `s${position}`, position } }),
      );
    }
    const first = rows.find((row) => row.position === 0)!;

    expect(await stages.delete(org.id, pipeline.id, first.id)).toBe(true);
    expect(await order(org.id, pipeline.id)).toEqual([["s1", 0], ["s2", 1], ["s3", 2], ["s4", 3]]);
  });

  it("is false for another organization's stage and for a stage of another pipeline", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const first = await pipelineWith(a.id, ["a"]);
    const second = await pipelineWith(a.id, [], "Support");
    expect(await stages.delete(b.id, first.pipeline.id, first.stages[0].id)).toBe(false);
    expect(await stages.delete(a.id, second.pipeline.id, first.stages[0].id)).toBe(false);
    expect(await prisma.pipelineStage.count()).toBe(1);
  });

  it("is PIPELINE_STAGE_IN_USE while a lead is in the stage, and the stage and positions stay", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a", "b"]);
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.moveToStage(org.id, lead.id, created[0].id);

    await expect(stages.delete(org.id, pipeline.id, created[0].id)).rejects.toMatchObject({
      code: "PIPELINE_STAGE_IN_USE",
    });
    expect(await order(org.id, pipeline.id)).toEqual([["a", 0], ["b", 1]]);
  });

  it("the foreign key itself refuses to delete a stage that holds a lead", async () => {
    const org = await newOrg();
    const { stages: created } = await pipelineWith(org.id, ["a"]);
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.moveToStage(org.id, lead.id, created[0].id);
    await expect(prisma.pipelineStage.delete({ where: { id: created[0].id } })).rejects.toThrow();
  });
});

describe("PrismaPipelineRepository: delete", () => {
  it("is refused with PIPELINE_NOT_EMPTY while the pipeline has stages, then succeeds once they are gone", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["a"]);
    await expect(pipelines.delete(org.id, pipeline.id)).rejects.toMatchObject({ code: "PIPELINE_NOT_EMPTY" });
    expect(await pipelines.findById(org.id, pipeline.id)).not.toBeNull();

    await stages.delete(org.id, pipeline.id, created[0].id);
    expect(await pipelines.delete(org.id, pipeline.id)).toBe(true);
    expect(await pipelines.findById(org.id, pipeline.id)).toBeNull();
  });
});

describe("PrismaLeadRepository.moveToStage", () => {
  it("sets the stage, leaves the status alone, and is reachable only inside the organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { stages: created } = await pipelineWith(a.id, ["a", "b"]);
    const lead = await leads.create(a.id, { name: "Rahul" });
    expect(lead.pipelineStageId).toBeNull();

    const moved = await leads.moveToStage(a.id, lead.id, created[1].id);
    expect(moved).toMatchObject({ pipelineStageId: created[1].id, status: "NEW" });
    expect(await leads.moveToStage(b.id, lead.id, created[0].id)).toBeNull();
  });

  it("refuses a stage of another organization, leaving the lead where it was", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const own = await pipelineWith(a.id, ["a"]);
    const foreign = await pipelineWith(b.id, ["x"]);
    const lead = await leads.create(a.id, { name: "Rahul" });
    await leads.moveToStage(a.id, lead.id, own.stages[0].id);

    expect(await leads.moveToStage(a.id, lead.id, foreign.stages[0].id)).toBeNull();
    expect((await leads.findById(a.id, lead.id))?.pipelineStageId).toBe(own.stages[0].id);
  });

  it("refuses a converted lead, which keeps its stage (the CONVERTED guard)", async () => {
    const org = await newOrg();
    const { stages: created } = await pipelineWith(org.id, ["a", "b"]);
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.moveToStage(org.id, lead.id, created[0].id);
    await leads.convert(org.id, lead.id);

    expect(await leads.moveToStage(org.id, lead.id, created[1].id)).toBeNull();
    expect((await leads.findById(org.id, lead.id))?.pipelineStageId).toBe(created[0].id);
  });

  it("is null for an unknown stage id", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul" });
    expect(await leads.moveToStage(org.id, lead.id, randomUUID())).toBeNull();
  });

  it("the CONVERTED guard also holds when a conversion races a move", async () => {
    const org = await newOrg();
    const { stages: created } = await pipelineWith(org.id, ["a", "b"]);
    const lead = await leads.create(org.id, { name: "Rahul" });

    const results = await Promise.allSettled([
      leads.convert(org.id, lead.id),
      leads.moveToStage(org.id, lead.id, created[1].id),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const final = (await leads.findById(org.id, lead.id))!;
    expect(final.status).toBe("CONVERTED");
  });
});

describe("PrismaPipelineRepository.getSummary", () => {
  it("counts leads per stage in the database, with 0 for an empty stage, in position order", async () => {
    const org = await newOrg();
    const { pipeline, stages: created } = await pipelineWith(org.id, ["New", "Contacted", "Proposal"]);
    for (const [name, stage] of [["1", 0], ["2", 0], ["3", 1]] as const) {
      const lead = await leads.create(org.id, { name });
      await leads.moveToStage(org.id, lead.id, created[stage].id);
    }
    await leads.create(org.id, { name: "No stage" });

    expect(await pipelines.getSummary(org.id, pipeline.id)).toEqual({
      pipeline: { id: pipeline.id, name: "Sales" },
      stages: [
        { id: created[0].id, name: "New", position: 0, leadCount: 2 },
        { id: created[1].id, name: "Contacted", position: 1, leadCount: 1 },
        { id: created[2].id, name: "Proposal", position: 2, leadCount: 0 },
      ],
      totalLeads: 3,
    });
  });

  it("is null for another organization's pipeline", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { pipeline } = await pipelineWith(a.id, ["x"]);
    expect(await pipelines.getSummary(b.id, pipeline.id)).toBeNull();
  });

  it("does not count a lead of another organization, even one pointing at the stage", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const { pipeline, stages: created } = await pipelineWith(a.id, ["x"]);
    await prisma.lead.create({ data: { organizationId: b.id, name: "Stray", pipelineStageId: created[0].id } });

    const summary = await pipelines.getSummary(a.id, pipeline.id);
    expect(summary?.stages[0].leadCount).toBe(0);
    expect(summary?.totalLeads).toBe(0);
  });
});

describe("cascades", () => {
  it("deleting an organization deletes its pipelines, stages and leads without tripping the stage foreign key", async () => {
    const org = await newOrg();
    const { stages: created } = await pipelineWith(org.id, ["a", "b"]);
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.moveToStage(org.id, lead.id, created[0].id);

    await prisma.organization.delete({ where: { id: org.id } });
    expect(await prisma.pipeline.count()).toBe(0);
    expect(await prisma.pipelineStage.count()).toBe(0);
    expect(await prisma.lead.count()).toBe(0);
  });
});
