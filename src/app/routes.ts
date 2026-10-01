import { Router } from "express";
import { UserRole } from "../domain/enums/UserRole";
import { AuthController } from "../infrastructure/http/controllers/AuthController";
import { UserController } from "../infrastructure/http/controllers/UserController";
import { Logger } from "../shared/logger";
import { Container } from "./container";
import { authenticate } from "./middleware/auth.middleware";
import { authorize } from "./middleware/role.middleware";

export function createRoutes(container: Container, logger: Logger): Router {
  const auth = new AuthController(container, logger);
  const users = new UserController(container.getCurrentUser, container.listUsers);
  const requireAuth = authenticate(container.tokens);

  const router = Router();

  router.post("/auth/register", auth.register);
  router.post("/auth/login", auth.login);
  router.post("/auth/refresh", auth.refresh);
  router.post("/auth/logout", auth.logout);

  router.get("/users/me", requireAuth, users.me);
  router.get("/admin/users", requireAuth, authorize(UserRole.ADMIN), users.list);

  return router;
}
