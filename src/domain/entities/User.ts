import { UserRole } from "../enums/UserRole";
import { UserStatus } from "../enums/UserStatus";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
