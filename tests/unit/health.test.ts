import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HealthController } from "../../src/infrastructure/http/controllers/HealthController";

describe("GET /health", () => {
  const app = express();
  app.get("/health", new HealthController().check);

  it("returns the success envelope with memory and event-loop figures", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.memory.rssMb).toBeGreaterThan(0);
    expect(res.body.data.eventLoopLagMs.p99).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.meta.timestamp).toBe("string");
  });
});
