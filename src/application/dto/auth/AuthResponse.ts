import { UserResponse } from "../user/UserResponse";

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export interface RegisterResponse {
  user: UserResponse;
}

export interface LoginResponse {
  user: UserResponse;
  tokens: TokenPairResponse;
}

export interface RefreshResponse {
  tokens: TokenPairResponse;
}
