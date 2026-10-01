import { Customer } from "../../../domain/entities/Customer";
import {
  CreateCustomerData,
  CustomerListQuery,
  CustomerPage,
  CustomerRepository,
  UpdateCustomerData,
} from "../../../domain/repositories/CustomerRepository";
import type { Prisma } from "../../../../generated/prisma/client";
import type { PrismaClient } from "../prisma";

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(organizationId: string, data: CreateCustomerData): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, organizationId } });
  }

  findById(organizationId: string, customerId: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id: customerId, organizationId } });
  }

  async update(
    organizationId: string,
    customerId: string,
    data: UpdateCustomerData,
  ): Promise<Customer | null> {
    try {
      return await this.prisma.customer.update({
        where: { id: customerId, organizationId },
        data,
      });
    } catch (error) {
      // P2025: no row matched the id and organization.
      if ((error as { code?: string }).code === "P2025") return null;
      throw error;
    }
  }

  async list(organizationId: string, query: CustomerListQuery): Promise<CustomerPage> {
    const where = buildWhere(organizationId, query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, totalItems };
  }
}

/** The organization id is always part of the filter; the optional filters only narrow it. */
function buildWhere(organizationId: string, query: CustomerListQuery): Prisma.CustomerWhereInput {
  const { search, company, createdFrom, createdTo } = query;
  return {
    organizationId,
    ...(company && { company: { equals: company, mode: "insensitive" } }),
    ...((createdFrom || createdTo) && {
      createdAt: { ...(createdFrom && { gte: createdFrom }), ...(createdTo && { lte: createdTo }) },
    }),
    ...(search && {
      OR: (["name", "email", "phone", "company"] as const).map((field) => ({
        [field]: { contains: escapeLike(search), mode: "insensitive" as const },
      })),
    }),
  };
}

/** Prisma's `contains` does not escape LIKE wildcards, so `%` and `_` would match anything. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** The sort field is a whitelisted value, never raw input. `id` makes the order total. */
function buildOrderBy(query: CustomerListQuery): Prisma.CustomerOrderByWithRelationInput[] {
  const { sortBy, sortOrder } = query;
  const primary =
    sortBy === "company" ? { company: { sort: sortOrder, nulls: "last" as const } } : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }];
}
