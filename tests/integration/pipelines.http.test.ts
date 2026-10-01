import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  buildIntegrationApp,
  createLead,
  createOrganization,
  joinOrganization,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const BASE = "/api/v1";
const pipelinesPath = (orgId: string, rest = "") => `${BASE}/organizations/${orgId}/pipelines${rest}`;
const leadStagePath = (orgId: string, leadId: string) => `${BASE}/organizations/${orgId}/leads/${leadId}/stage`;

function expectEnvelope(body: any, success: boolean) {
  expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "meta", "success"]);
  expect(body.success).toBe(success);
  if (success) expect(body.error).toBeNull();
  else {
    expect(body.data).toBeNull();
    expect(Object.keys(body.error).sort()).toEqual(["code", "details"]);
  }
}

function expectError(res: any, status: number, code: string) {
  expect(res.status).toBe(status);
  expectEnvelope(res.body, false);
  expect(res.body.error.code).toBe(code);
}

/** Organization A (owner, admin, member) and organization B with its own owner. */
async function setup() {
  const owner = await signUp(ctx, "owner@example.com");
  const org = await createOrganization(ctx, owner, "Org A");
  const admin = await joinOrganization(ctx, owner, org.id, "admin@example.com", "ADMIN");
  const member = await joinOrganization(ctx, owner, org.id, "member@example.com", "MEMBER");
  const otherOwner = await signUp(ctx, "other@example.com");
  const otherOrg = await createOrganization(ctx, otherOwner, "Org B");
  return { owner, admin, member, org, otherOwner, otherOrg };
}

type Actor = Awaited<ReturnType<typeof signUp>>;
type Org = Awaited<ReturnType<typeof createOrganization>>;

async function makePipeline(actor: Actor, org: Org, name = "Sales Pipeline") {
  const res = await api.post(pipelinesPath(org.id)).set(bearer(actor.accessToken)).send({ name });
  return res.body.data.pipeline as { id: string; name: string; stages: any[] };
}

async function makeStage(actor: Actor, org: Org, pipelineId: string, name: string) {
  const res = await api
    .post(pipelinesPath(org.id, `/${pipelineId}/stages`))
    .set(bearer(actor.accessToken))
    .send({ name });
  return res.body.data.stage as { id: string; name: string; position: number };
}

async function pipelineWithStages(
  actor: Actor,
  org: Org,
  names = ["New Lead", "Contacted", "Demo"],
  pipelineName = "Sales Pipeline",
) {
  const pipeline = await makePipeline(actor, org, pipelineName);
  const stages = [];
  for (const name of names) stages.push(await makeStage(actor, org, pipeline.id, name));
  return { pipeline, stages };
}

describe("POST /organizations/:organizationId/pipelines", () => {
  it("lets an owner and an admin create a pipeline", async () => {
    const { owner, admin, org } = await setup();
    for (const [actor, name] of [[owner, "One"], [admin, "Two"]] as const) {
      const res = await api
        .post(pipelinesPath(org.id))
        .set(bearer(actor.accessToken))
        .send({ name, description: "Standard B2B sales process" });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, true);
      expect(res.body.message).toBe("Pipeline created successfully.");
      expect(res.body.data.pipeline).toMatchObject({
        name,
        description: "Standard B2B sales process",
        stages: [],
      });
      expect(res.body.data.pipeline).not.toHaveProperty("organizationId");
    }
  });

  it("is 403 INSUFFICIENT_ORGANIZATION_PERMISSION for a member", async () => {
    const { member, org } = await setup();
    const res = await api.post(pipelinesPath(org.id)).set(bearer(member.accessToken)).send({ name: "Sales" });
    expectError(res, 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
  });

  it("is 401 without a token and 404 ORGANIZATION_NOT_FOUND for a non-member", async () => {
    const { otherOwner, org } = await setup();
    expectError(await api.post(pipelinesPath(org.id)).send({ name: "A" }), 401, "UNAUTHORIZED");
    expectError(
      await api.post(pipelinesPath(org.id)).set(bearer(otherOwner.accessToken)).send({ name: "A" }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it("rejects invalid bodies and server-owned fields with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    for (const body of [
      {},
      { name: "" },
      { name: "A", description: "x".repeat(501) },
      { name: "A", organizationId: randomUUID() },
      { name: "A", stages: [] },
    ]) {
      expectError(await api.post(pipelinesPath(org.id)).set(bearer(owner.accessToken)).send(body), 400, "VALIDATION_ERROR");
    }
  });

  it("is 409 PIPELINE_ALREADY_EXISTS for a duplicate name, but another organization may reuse it", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    await makePipeline(owner, org);
    expectError(
      await api.post(pipelinesPath(org.id)).set(bearer(owner.accessToken)).send({ name: "Sales Pipeline" }),
      409,
      "PIPELINE_ALREADY_EXISTS",
    );
    const res = await api.post(pipelinesPath(otherOrg.id)).set(bearer(otherOwner.accessToken)).send({ name: "Sales Pipeline" });
    expect(res.status).toBe(201);
  });
});

describe("GET pipelines", () => {
  it("lets every role list and get pipelines, with the stages in position order", async () => {
    const { owner, member, org } = await setup();
    const { pipeline } = await pipelineWithStages(owner, org);

    const list = await api.get(pipelinesPath(org.id)).set(bearer(member.accessToken));
    expect(list.status).toBe(200);
    expectEnvelope(list.body, true);
    expect(list.body.data.pipelines).toHaveLength(1);
    expect(list.body.data.pipelines[0].stages.map((s: any) => [s.name, s.position])).toEqual([
      ["New Lead", 0],
      ["Contacted", 1],
      ["Demo", 2],
    ]);

    const one = await api.get(pipelinesPath(org.id, `/${pipeline.id}`)).set(bearer(member.accessToken));
    expect(one.status).toBe(200);
    expect(one.body.data.pipeline.id).toBe(pipeline.id);
  });

  it("never shows another organization's pipelines", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const { pipeline } = await pipelineWithStages(otherOwner, otherOrg);

    expect((await api.get(pipelinesPath(org.id)).set(bearer(owner.accessToken))).body.data.pipelines).toEqual([]);
    expectError(
      await api.get(pipelinesPath(org.id, `/${pipeline.id}`)).set(bearer(owner.accessToken)),
      404,
      "PIPELINE_NOT_FOUND",
    );
    expectError(
      await api.get(pipelinesPath(otherOrg.id, `/${pipeline.id}`)).set(bearer(owner.accessToken)),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it("is 400 VALIDATION_ERROR for an id that is not a uuid", async () => {
    const { owner, org } = await setup();
    expectError(await api.get(pipelinesPath(org.id, "/nope")).set(bearer(owner.accessToken)), 400, "VALIDATION_ERROR");
  });
});

describe("PATCH and DELETE /pipelines/:pipelineId", () => {
  it("lets an admin rename a pipeline and clear its description", async () => {
    const { owner, admin, org } = await setup();
    const pipeline = await makePipeline(owner, org);
    const res = await api
      .patch(pipelinesPath(org.id, `/${pipeline.id}`))
      .set(bearer(admin.accessToken))
      .send({ name: "Enterprise", description: null });
    expect(res.status).toBe(200);
    expect(res.body.data.pipeline).toMatchObject({ name: "Enterprise", description: null });
  });

  it("is 403 for a member, 400 for an empty body, and 409 for a taken name", async () => {
    const { owner, member, org } = await setup();
    const pipeline = await makePipeline(owner, org);
    await makePipeline(owner, org, "Support");
    const url = pipelinesPath(org.id, `/${pipeline.id}`);

    expectError(await api.patch(url).set(bearer(member.accessToken)).send({ name: "X" }), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await api.patch(url).set(bearer(owner.accessToken)).send({}), 400, "VALIDATION_ERROR");
    expectError(await api.patch(url).set(bearer(owner.accessToken)).send({ name: "Support" }), 409, "PIPELINE_ALREADY_EXISTS");
  });

  it("deletes a pipeline only once it has no stages, and a member may not", async () => {
    const { owner, member, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["a"]);
    const url = pipelinesPath(org.id, `/${pipeline.id}`);

    expectError(await api.delete(url).set(bearer(member.accessToken)), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await api.delete(url).set(bearer(owner.accessToken)), 409, "PIPELINE_NOT_EMPTY");

    await api.delete(`${url}/stages/${stages[0].id}`).set(bearer(owner.accessToken));
    const res = await api.delete(url).set(bearer(owner.accessToken));
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data).toBeNull();
    expectError(await api.get(url).set(bearer(owner.accessToken)), 404, "PIPELINE_NOT_FOUND");
  });

  it("is 404 PIPELINE_NOT_FOUND for another organization's pipeline", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const pipeline = await makePipeline(otherOwner, otherOrg);
    const url = pipelinesPath(org.id, `/${pipeline.id}`);
    expectError(await api.patch(url).set(bearer(owner.accessToken)).send({ name: "X" }), 404, "PIPELINE_NOT_FOUND");
    expectError(await api.delete(url).set(bearer(owner.accessToken)), 404, "PIPELINE_NOT_FOUND");
  });
});

describe("pipeline stages", () => {
  it("assigns the positions on the server, and a client position is rejected", async () => {
    const { owner, org } = await setup();
    const pipeline = await makePipeline(owner, org);
    const url = pipelinesPath(org.id, `/${pipeline.id}/stages`);

    for (const [index, name] of ["New Lead", "Contacted", "Demo Scheduled"].entries()) {
      const res = await api.post(url).set(bearer(owner.accessToken)).send({ name });
      expect(res.status).toBe(201);
      expect(res.body.data.stage).toMatchObject({ name, position: index, pipelineId: pipeline.id });
    }
    expectError(await api.post(url).set(bearer(owner.accessToken)).send({ name: "X", position: 937 }), 400, "VALIDATION_ERROR");
  });

  it("is 403 for a member, 409 for a duplicate name, and 404 for another organization's pipeline", async () => {
    const { owner, member, org, otherOwner, otherOrg } = await setup();
    const { pipeline } = await pipelineWithStages(owner, org, ["a"]);
    const foreign = await makePipeline(otherOwner, otherOrg);

    const url = pipelinesPath(org.id, `/${pipeline.id}/stages`);
    expectError(await api.post(url).set(bearer(member.accessToken)).send({ name: "b" }), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await api.post(url).set(bearer(owner.accessToken)).send({ name: "a" }), 409, "PIPELINE_STAGE_ALREADY_EXISTS");
    expectError(
      await api.post(pipelinesPath(org.id, `/${foreign.id}/stages`)).set(bearer(owner.accessToken)).send({ name: "b" }),
      404,
      "PIPELINE_NOT_FOUND",
    );
  });

  it("renames a stage without moving it", async () => {
    const { owner, admin, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org);
    const res = await api
      .patch(pipelinesPath(org.id, `/${pipeline.id}/stages/${stages[1].id}`))
      .set(bearer(admin.accessToken))
      .send({ name: "Qualified" });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toMatchObject({ name: "Qualified", position: 1 });
  });

  it("deletes a stage and closes the gap, but not a stage that holds leads", async () => {
    const { owner, member, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["a", "b", "c"]);
    const lead = await createLead(ctx, owner, org);
    await api.patch(leadStagePath(org.id, lead.id)).set(bearer(member.accessToken)).send({ pipelineStageId: stages[2].id });

    const base = pipelinesPath(org.id, `/${pipeline.id}/stages`);
    expectError(await api.delete(`${base}/${stages[0].id}`).set(bearer(member.accessToken)), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await api.delete(`${base}/${stages[2].id}`).set(bearer(owner.accessToken)), 409, "PIPELINE_STAGE_IN_USE");

    const res = await api.delete(`${base}/${stages[0].id}`).set(bearer(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    const after = await api.get(pipelinesPath(org.id, `/${pipeline.id}`)).set(bearer(owner.accessToken));
    expect(after.body.data.pipeline.stages.map((s: any) => [s.name, s.position])).toEqual([["b", 0], ["c", 1]]);
    expectError(await api.delete(`${base}/${randomUUID()}`).set(bearer(owner.accessToken)), 404, "PIPELINE_STAGE_NOT_FOUND");
  });
});

describe("PATCH /pipelines/:pipelineId/stages/reorder", () => {
  it("rewrites the positions and returns the pipeline (the route is not shadowed by :stageId)", async () => {
    const { owner, admin, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["a", "b", "c", "d"]);
    const [a, b, c, d] = stages.map((s) => s.id);

    const res = await api
      .patch(pipelinesPath(org.id, `/${pipeline.id}/stages/reorder`))
      .set(bearer(admin.accessToken))
      .send({ stageIds: [c, a, b, d] });
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data.pipeline.stages.map((s: any) => [s.name, s.position])).toEqual([["c", 0], ["a", 1], ["b", 2], ["d", 3]]);
  });

  it("is 400 INVALID_STAGE_ORDER for a duplicate, missing, extra or foreign id, and changes nothing", async () => {
    const { owner, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["a", "b"]);
    const other = await pipelineWithStages(owner, org, ["x"], "Support");
    const [a, b] = stages.map((s) => s.id);
    const url = pipelinesPath(org.id, `/${pipeline.id}/stages/reorder`);

    for (const stageIds of [[a, a], [a], [a, b, randomUUID()], [a, other.stages[0].id]]) {
      expectError(await api.patch(url).set(bearer(owner.accessToken)).send({ stageIds }), 400, "INVALID_STAGE_ORDER");
    }
    const after = await api.get(pipelinesPath(org.id, `/${pipeline.id}`)).set(bearer(owner.accessToken));
    expect(after.body.data.pipeline.stages.map((s: any) => s.name)).toEqual(["a", "b"]);
  });

  it("is 403 for a member, 400 VALIDATION_ERROR for a malformed body, and 404 for another organization's pipeline", async () => {
    const { owner, member, org, otherOwner, otherOrg } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["a"]);
    const foreign = await pipelineWithStages(otherOwner, otherOrg, ["x"]);
    const url = pipelinesPath(org.id, `/${pipeline.id}/stages/reorder`);

    expectError(await api.patch(url).set(bearer(member.accessToken)).send({ stageIds: [stages[0].id] }), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await api.patch(url).set(bearer(owner.accessToken)).send({ stageIds: [] }), 400, "VALIDATION_ERROR");
    expectError(
      await api
        .patch(pipelinesPath(org.id, `/${foreign.pipeline.id}/stages/reorder`))
        .set(bearer(owner.accessToken))
        .send({ stageIds: [foreign.stages[0].id] }),
      404,
      "PIPELINE_NOT_FOUND",
    );
  });
});

describe("PATCH /organizations/:organizationId/leads/:leadId/stage", () => {
  it("lets every role move a lead, shows the stage on the lead, and leaves its status alone", async () => {
    const { owner, admin, member, org } = await setup();
    const { stages } = await pipelineWithStages(owner, org);
    const lead = await createLead(ctx, owner, org);
    expect(lead).toHaveProperty("pipelineStageId", null);

    for (const [actor, stage] of [[member, stages[0]], [admin, stages[1]], [owner, stages[2]]] as const) {
      const res = await api
        .patch(leadStagePath(org.id, lead.id))
        .set(bearer(actor.accessToken))
        .send({ pipelineStageId: stage.id });
      expect(res.status).toBe(200);
      expectEnvelope(res.body, true);
      expect(res.body.data.lead).toMatchObject({ id: lead.id, pipelineStageId: stage.id, status: "NEW" });
    }

    const got = await api.get(`${BASE}/organizations/${org.id}/leads/${lead.id}`).set(bearer(member.accessToken));
    expect(got.body.data.lead.pipelineStageId).toBe(stages[2].id);
    const list = await api.get(`${BASE}/organizations/${org.id}/leads`).set(bearer(member.accessToken));
    expect(list.body.data.leads[0].pipelineStageId).toBe(stages[2].id);
  });

  it("is 404 PIPELINE_STAGE_NOT_FOUND for another organization's stage or an unknown one, and the lead stays put", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const foreign = await pipelineWithStages(otherOwner, otherOrg, ["x"]);
    const lead = await createLead(ctx, owner, org);

    for (const pipelineStageId of [foreign.stages[0].id, randomUUID()]) {
      expectError(
        await api.patch(leadStagePath(org.id, lead.id)).set(bearer(owner.accessToken)).send({ pipelineStageId }),
        404,
        "PIPELINE_STAGE_NOT_FOUND",
      );
    }
    const got = await api.get(`${BASE}/organizations/${org.id}/leads/${lead.id}`).set(bearer(owner.accessToken));
    expect(got.body.data.lead.pipelineStageId).toBeNull();
  });

  it("is 404 LEAD_NOT_FOUND for another organization's lead, and 404 ORGANIZATION_NOT_FOUND for a non-member", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const { stages } = await pipelineWithStages(owner, org, ["a"]);
    const foreignLead = await createLead(ctx, otherOwner, otherOrg);

    expectError(
      await api.patch(leadStagePath(org.id, foreignLead.id)).set(bearer(owner.accessToken)).send({ pipelineStageId: stages[0].id }),
      404,
      "LEAD_NOT_FOUND",
    );
    expectError(
      await api.patch(leadStagePath(org.id, foreignLead.id)).set(bearer(otherOwner.accessToken)).send({ pipelineStageId: stages[0].id }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it("is 409 LEAD_ALREADY_CONVERTED for a converted lead", async () => {
    const { owner, org } = await setup();
    const { stages } = await pipelineWithStages(owner, org, ["a", "b"]);
    const lead = await createLead(ctx, owner, org);
    await api.patch(leadStagePath(org.id, lead.id)).set(bearer(owner.accessToken)).send({ pipelineStageId: stages[0].id });
    await api.post(`${BASE}/organizations/${org.id}/leads/${lead.id}/convert`).set(bearer(owner.accessToken)).send({});

    expectError(
      await api.patch(leadStagePath(org.id, lead.id)).set(bearer(owner.accessToken)).send({ pipelineStageId: stages[1].id }),
      409,
      "LEAD_ALREADY_CONVERTED",
    );
  });

  it("is 400 for a malformed body, and an ordinary lead update or create cannot set the stage", async () => {
    const { owner, org } = await setup();
    const { stages } = await pipelineWithStages(owner, org, ["a"]);
    const lead = await createLead(ctx, owner, org);

    for (const body of [{}, { pipelineStageId: "nope" }, { pipelineStageId: null }, { pipelineStageId: stages[0].id, status: "QUALIFIED" }]) {
      expectError(await api.patch(leadStagePath(org.id, lead.id)).set(bearer(owner.accessToken)).send(body), 400, "VALIDATION_ERROR");
    }
    expectError(
      await api
        .patch(`${BASE}/organizations/${org.id}/leads/${lead.id}`)
        .set(bearer(owner.accessToken))
        .send({ pipelineStageId: stages[0].id }),
      400,
      "VALIDATION_ERROR",
    );
    expectError(
      await api
        .post(`${BASE}/organizations/${org.id}/leads`)
        .set(bearer(owner.accessToken))
        .send({ name: "A", pipelineStageId: stages[0].id }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("is 401 without a token", async () => {
    const { org } = await setup();
    expectError(await api.patch(leadStagePath(org.id, randomUUID())).send({ pipelineStageId: randomUUID() }), 401, "UNAUTHORIZED");
  });
});

describe("GET /pipelines/:pipelineId/summary", () => {
  it("counts the leads per stage with the database and lets every role read it", async () => {
    const { owner, member, org } = await setup();
    const { pipeline, stages } = await pipelineWithStages(owner, org, ["New", "Contacted", "Proposal"]);
    for (const [name, stage] of [["1", 0], ["2", 0], ["3", 1]] as const) {
      const lead = await createLead(ctx, owner, org, { name });
      await api.patch(leadStagePath(org.id, lead.id)).set(bearer(owner.accessToken)).send({ pipelineStageId: stages[stage].id });
    }
    await createLead(ctx, owner, org, { name: "No stage" });

    const res = await api.get(pipelinesPath(org.id, `/${pipeline.id}/summary`)).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data).toEqual({
      pipeline: { id: pipeline.id, name: "Sales Pipeline" },
      stages: [
        { id: stages[0].id, name: "New", position: 0, leadCount: 2 },
        { id: stages[1].id, name: "Contacted", position: 1, leadCount: 1 },
        { id: stages[2].id, name: "Proposal", position: 2, leadCount: 0 },
      ],
      totalLeads: 3,
    });
  });

  it("is 404 PIPELINE_NOT_FOUND for another organization's pipeline", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const foreign = await makePipeline(otherOwner, otherOrg);
    expectError(
      await api.get(pipelinesPath(org.id, `/${foreign.id}/summary`)).set(bearer(owner.accessToken)),
      404,
      "PIPELINE_NOT_FOUND",
    );
  });
});
