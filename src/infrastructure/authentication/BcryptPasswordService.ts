import bcrypt from "bcrypt";
import { PasswordService } from "../../application/services/PasswordService";

export class BcryptPasswordService implements PasswordService {
  constructor(private readonly cost: number = 12) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
