import { PasswordService } from "../application/services/PasswordService";
import { TokenService } from "../application/services/TokenService";
import { LoginUser } from "../application/use-cases/auth/LoginUser";
import { LogoutUser } from "../application/use-cases/auth/LogoutUser";
import { RefreshTokens } from "../application/use-cases/auth/RefreshTokens";
import { RegisterUser } from "../application/use-cases/auth/RegisterUser";
import { GetCurrentUser } from "../application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../application/use-cases/user/ListUsers";
import { RefreshTokenRepository } from "../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../domain/repositories/UserRepository";

export interface Dependencies {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  passwords: PasswordService;
  tokens: TokenService;
}

/** The one place where use cases are wired to their dependencies. */
export function buildContainer({ users, refreshTokens, passwords, tokens }: Dependencies) {
  return {
    tokens,
    registerUser: new RegisterUser(users, passwords),
    loginUser: new LoginUser(users, refreshTokens, passwords, tokens),
    refreshTokens: new RefreshTokens(users, refreshTokens, tokens),
    logoutUser: new LogoutUser(refreshTokens, tokens),
    getCurrentUser: new GetCurrentUser(users),
    listUsers: new ListUsers(users),
  };
}

export type Container = ReturnType<typeof buildContainer>;
