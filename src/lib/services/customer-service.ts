import { PaymentTerms } from "@prisma/client";
import { prisma } from "../prisma";
import { getUserByIdCached } from "../access-control";
import type {
  CustomerCreateDTO,
  CustomerDTO as CustomerItem,
  CustomerUpdateDTO,
} from "@/types/dto";
import {
  customerTypeFromDatabase,
  customerTypeForDatabase,
  globalForDataService,
  LOGIN_USERS_TTL_MS,
} from "./shared";

export const CustomerService = {
  async getCustomers(): Promise<CustomerItem[]> {
    const customers = await prisma.customer.findMany({
      relationLoadStrategy: "join",
      include: { salesRep: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return customers.map((c) => ({
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    }));
  },

  async getCustomerById(id: string): Promise<CustomerItem | undefined> {
    const c = await prisma.customer.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: { salesRep: { select: { id: true, name: true } } },
    });
    if (!c) return undefined;
    return {
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    };
  },

  async getUserById(id: string) {
    return getUserByIdCached(id);
  },

  async getLoginUsers() {
    const cached = globalForDataService.loginUsersCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const users = await prisma.user.findMany({
      where: { NOT: { email: { startsWith: "preview-" } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    globalForDataService.loginUsersCache = {
      data: users,
      expiresAt: Date.now() + LOGIN_USERS_TTL_MS,
    };
    return users;
  },

  async addCustomer(data: CustomerCreateDTO): Promise<CustomerItem> {
    const c = await prisma.customer.create({
      data: {
        ...data,
        paymentTerms: data.paymentTerms || "MONTHLY_30",
        customerType: customerTypeForDatabase(data.customerType || "DESIGNER"),
      },
      relationLoadStrategy: "join",
      include: { salesRep: true },
    });
    return {
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    };
  },

  async updateCustomer(id: string, data: CustomerUpdateDTO): Promise<CustomerItem> {
    const c = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        customerType: customerTypeForDatabase(data.customerType),
        taxId: data.taxId || null,
        phone: data.phone,
        address: data.address || null,
        defaultDiscount: data.defaultDiscount,
        paymentTerms: data.paymentTerms as PaymentTerms,
        salesRepId: data.salesRepId,
      },
      relationLoadStrategy: "join",
      include: { salesRep: true },
    });
    return {
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    };
  },

  async deleteCustomer(id: string): Promise<"DELETED" | "NOT_FOUND" | "HAS_PROJECTS"> {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id },
        select: { _count: { select: { projects: true } } },
      });
      if (!customer) return "NOT_FOUND";
      if (customer._count.projects > 0) return "HAS_PROJECTS";
      await tx.customer.delete({ where: { id } });
      return "DELETED";
    });
  },
};
