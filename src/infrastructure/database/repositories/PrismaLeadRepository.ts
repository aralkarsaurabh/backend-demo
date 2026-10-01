import { Lead } from "../../../domain/entities/Lead";
import {
  ConvertedLead,
  CreateLeadData,
  LeadListQuery,
  LeadPage,
  LeadRepository,
  UpdateLeadData,
} from "../../../domain/repositories/LeadRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { Prisma } from "../../../../generated/prisma/client";
import type { PrismaClient } from "../prisma";

export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(organizationId: string, data: CreateLeadData): Promise<Lead> {
    return this.prisma.lead.create({ data: { ...data, organizationId } });
  }

  findById(organizationId: string, leadId: string): Promise<Lead | null> {
    return this.prisma.lead.findFirst({ where: { id: leadId, organizationId } });
  }

  /** The `status <> CONVERTED` condition keeps a concurrent conversion from being overwritten (D31). */
  async update(organizationId: string, leadId: string, data: UpdateLeadData): Promise<Lead | null> {
    const { count } = await this.prisma.lead.updateMany({
      where: { id: leadId, organizationId, status: { not: "CONVERTED" } },
      data,
    });
    if (count === 0) return null;
    return this.findById(organizationId, leadId);
  }

  async delete(organizationId: string, leadId: string): Promise<boolean> {
    const { count } = await this.prisma.lead.deleteMany({ where: { id: leadId, organizationId } });
    return count > 0;
  }

  async list(organizationId: string, query: LeadListQuery): Promise<LeadPage> {
    const where = buildWhere(organizationId, query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, totalItems };
  }

  /**
   * One transaction (D30): the customer is created first, then the lead is moved to CONVERTED
   * only if it is not already. When that guard matches nothing, the throw rolls the customer
   * back, so a lead is never CONVERTED without a customer, nor a customer left without a lead.
   */
  convert(organizationId: string, leadId: string): Promise<ConvertedLead | null> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId, organizationId } });
      if (!lead) return null;

      const customer = await tx.customer.create({
        data: {
          organizationId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          notes: lead.notes,
        },
      });

      const { count } = await tx.lead.updateMany({
        where: { id: leadId, organizationId, status: { not: "CONVERTED" } },
        data: { status: "CONVERTED", convertedAt: new Date(), convertedCustomerId: customer.id },
      });
      if (count === 0) throw new AppError(ErrorCode.LEAD_ALREADY_CONVERTED);

      const converted = await tx.lead.findFirstOrThrow({ where: { id: leadId, organizationId } });
      return { lead: converted, customer };
    });
  }
}

/** The organization id is always part of the filter; the optional filters only narrow it. */
function buildWhere(organizationId: string, query: LeadListQuery): Prisma.LeadWhereInput {
  const { search, status, source, assignedToUserId, createdFrom, createdTo } = query;
  return {
    organizationId,
    ...(status && { status }),
    ...(source && { source }),
    ...(assignedToUserId && { assignedToUserId }),
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
function buildOrderBy(query: LeadListQuery): Prisma.LeadOrderByWithRelationInput[] {
  const { sortBy, sortOrder } = query;
  const primary =
    sortBy === "company" ? { company: { sort: sortOrder, nulls: "last" as const } } : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }];
}
