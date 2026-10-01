import { Customer } from "../../../domain/entities/Customer";
import {
  CreateCustomerData,
  CustomerRepository,
} from "../../../domain/repositories/CustomerRepository";
import type { PrismaClient } from "../prisma";

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(organizationId: string, data: CreateCustomerData): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, organizationId } });
  }

  findById(organizationId: string, customerId: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id: customerId, organizationId } });
  }
}
