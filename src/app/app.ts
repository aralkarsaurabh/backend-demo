import express, { Express } from "express";
import { Logger, consoleLogger } from "../shared/logger";
import { Container } from "./container";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { createRoutes } from "./routes";

export function createApp(container: Container, logger: Logger = consoleLogger): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));

  // Responses can carry tokens, so they must never be cached.
  app.use("/api/v1", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api/v1", createRoutes(container, logger));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
