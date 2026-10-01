import { OrganizationRole } from "../../domain/enums/OrganizationRole";
import { UserRole } from "../../domain/enums/UserRole";

export interface AuthUser {
  id: string;
  role: UserRole;
}

/** The caller's membership in the organization named by `:organizationId`. */
export interface OrganizationAccess {
  organizationId: string;
  role: OrganizationRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware from the verified access token. */
      user?: AuthUser;
      /** Set by requireOrganizationMembership from a database lookup on every request. */
      organizationMembership?: OrganizationAccess;
    }
  }
}
