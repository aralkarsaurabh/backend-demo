import { Request, Response } from "express";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { ApiResponse } from "../../../shared/response/ApiResponse";

const NS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;

const toMs = (ns: number) => (Number.isFinite(ns) ? Math.round((ns / NS_PER_MS) * 100) / 100 : 0);

/**
 * Liveness plus the server-side numbers a load test needs (saturation): memory and
 * event-loop lag since the previous call. It does not touch the database.
 */
export class HealthController {
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.loopDelay.enable();
  }

  check = (_req: Request, res: Response) => {
    const memory = process.memoryUsage();
    const data = {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(memory.rss / BYTES_PER_MB),
        heapUsedMb: Math.round(memory.heapUsed / BYTES_PER_MB),
      },
      eventLoopLagMs: {
        mean: toMs(this.loopDelay.mean),
        p99: toMs(this.loopDelay.percentile(99)),
        max: toMs(this.loopDelay.max),
      },
    };
    this.loopDelay.reset();
    res.status(200).json(ApiResponse.success("Service is healthy.", data));
  };
}
