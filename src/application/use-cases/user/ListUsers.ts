import { UserRepository } from "../../../domain/repositories/UserRepository";
import {
  AdminUserResponse,
  toAdminUserResponse,
} from "../../dto/user/UserResponse";

export class ListUsers {
  constructor(private readonly users: UserRepository) {}

  async execute(): Promise<{ users: AdminUserResponse[] }> {
    const users = await this.users.findAll();
    return { users: users.map(toAdminUserResponse) };
  }
}
