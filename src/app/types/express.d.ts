import { UserRole } from "../../domain/enums/UserRole";

export interface AuthUser {
  id: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware from the verified access token. */
      user?: AuthUser;
    }
  }
}
