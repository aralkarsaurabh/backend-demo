import { User } from "../entities/User";
import { UserRole } from "../enums/UserRole";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Throws AppError(EMAIL_ALREADY_EXISTS) if the email is already taken. */
  create(data: CreateUserData): Promise<User>;
  /** Used by GET /admin/users. */
  findAll(): Promise<User[]>;
}
