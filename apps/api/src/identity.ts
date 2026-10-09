import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ORG_SCHEMAS, SETTING_SCHEMAS, roleUpdateSchema, userCreateSchema, userUpdateSchema, type OrgCollection } from "@fixotec/shared";
import { hashPassword } from "@fixotec/shared/password";
import type { Prisma } from "@fixotec/db";
import { AuthUser, RequirePermissions, pageOf, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService, Tx } from "./services";

type ReqUser = { user: AuthUser; ip?: string; headers: Record<string, string | string[] | undefined> };

const SUPER = "super_admin";

function isSuper(user: AuthUser) {
  return user.roleKeys.includes(SUPER);
}

@Controller()
export class IdentityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("users")
  @RequirePermissions("users.view")
  async users(@Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = page.q
      ? { OR: [{ name: { contains: page.q, mode: "insensitive" as const } }, { email: { contains: page.q, mode: "insensitive" as const } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: page.skip,
        take: page.pageSize,
        orderBy: { name: "asc" },
        select: {
          id: true, email: true, name: true, phone: true, kind: true, active: true, jobTitle: true, mfaEnabled: true,
          customerId: true, branchId: true, departmentId: true, lastLoginAt: true,
          roles: { include: { role: { select: { id: true, key: true, name: true, kind: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  @Post("users")
  @RequirePermissions("users.create")
  async createUser(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(userCreateSchema, body);
    const roles = await this.assignableRoles(req.user, input.roleKeys, input.kind);
    await this.assertAccountLink(input.kind, input.customerId);
    const email = input.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new BadRequestException("A user with this email already exists");
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name,
          passwordHash: hashPassword(input.password),
          phone: input.phone,
          kind: input.kind,
          customerId: input.kind === "EXTERNAL" ? input.customerId : undefined,
          branchId: input.branchId,
          departmentId: input.departmentId,
          jobTitle: input.jobTitle,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true, email: true, name: true, kind: true },
      });
      await this.log(req, "create", "user", user.id, undefined, { ...user, roleKeys: roles.map((role) => role.key) }, tx);
      return user;
    });
  }

  @Patch("users/:id")
  @RequirePermissions("users.edit")
  async updateUser(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(userUpdateSchema, body);
    const before = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    if (!before) throw new NotFoundException("User not found");
    const beforeKeys = before.roles.map((link) => link.role.key);
    const self = id === req.user.id;
    if (beforeKeys.includes(SUPER) && !isSuper(req.user)) throw new ForbiddenException("Only a super admin can change a super admin");
    if (self && (input.roleKeys || input.active === false || input.customerId !== undefined)) throw new ForbiddenException("You cannot change your own roles, account link, or deactivate yourself");
    if (!self && !isSuper(req.user)) {
      const targetPermissions = before.roles.flatMap((link) => link.role.permissions.map((grant) => grant.permission.key));
      if (targetPermissions.some((permission) => !req.user.permissions.includes(permission))) throw new ForbiddenException("You cannot change a user who holds permissions you do not");
    }
    const roles = input.roleKeys ? await this.assignableRoles(req.user, input.roleKeys, before.kind) : null;
    if (input.customerId !== undefined) {
      if (before.kind !== "EXTERNAL" && input.customerId) throw new BadRequestException("Only portal users are linked to a customer account");
      if (before.kind === "EXTERNAL") await this.assertAccountLink("EXTERNAL", input.customerId ?? undefined);
    }
    if (roles && beforeKeys.includes(SUPER) && !roles.some((role) => role.key === SUPER)) {
      const remaining = await this.prisma.userRole.count({ where: { role: { key: SUPER }, user: { active: true }, userId: { not: id } } });
      if (!remaining) throw new BadRequestException("At least one active super admin must remain");
    }
    if (input.active === false && beforeKeys.includes(SUPER)) {
      const remaining = await this.prisma.userRole.count({ where: { role: { key: SUPER }, user: { active: true }, userId: { not: id } } });
      if (!remaining) throw new BadRequestException("At least one active super admin must remain");
    }
    const revoke = Boolean(input.password || input.active === false || roles || input.customerId !== undefined);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          phone: input.phone,
          active: input.active,
          jobTitle: input.jobTitle,
          branchId: input.branchId,
          departmentId: input.departmentId,
          customerId: input.customerId,
          passwordHash: input.password ? hashPassword(input.password) : undefined,
        },
      });
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      }
      if (revoke) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.log(
        req,
        "update",
        "user",
        id,
        { name: before.name, active: before.active, customerId: before.customerId, roles: beforeKeys },
        { name: updated.name, active: updated.active, customerId: updated.customerId, roles: roles ? roles.map((role) => role.key) : beforeKeys, passwordChanged: Boolean(input.password), sessionsRevoked: revoke },
        tx,
      );
      return updated;
    });
    return { id: user.id, email: user.email, name: user.name, active: user.active };
  }

  @Get("roles")
  @RequirePermissions("roles.view")
  roles() {
    return this.prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
  }

  @Patch("roles/:key")
  @RequirePermissions("roles.edit")
  async updateRole(@Param("key") key: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(roleUpdateSchema, body);
    const role = await this.prisma.role.findUnique({ where: { key } });
    if (!role) throw new NotFoundException("Role not found");
    if (key === SUPER) throw new BadRequestException("The super admin role stays fully granted");
    if (!isSuper(req.user) && req.user.roleKeys.includes(key)) throw new ForbiddenException("You cannot edit a role you hold");
    const requested = [...new Set(input.permissionKeys)];
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: requested } } });
    if (permissions.length !== requested.length) throw new BadRequestException("Unknown permission key");
    const before = await this.prisma.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } });
    const beforeKeys = before.map((row) => row.permission.key);
    if (!isSuper(req.user)) {
      const added = requested.filter((permission) => !beforeKeys.includes(permission));
      const beyond = added.filter((permission) => !req.user.permissions.includes(permission));
      if (beyond.length) throw new ForbiddenException(`You cannot grant permissions you do not hold: ${beyond.join(", ")}`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
      await this.log(req, "update", "role", role.id, beforeKeys, requested, tx);
    });
    return { key, permissions: requested };
  }

  @Get("permissions")
  @RequirePermissions("roles.view")
  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] });
  }

  @Get("organization")
  @RequirePermissions("organization.view")
  async organization() {
    const [legalEntities, branches, departments, costCenters, profitCenters, financialYears, currencies, units, settings] = await Promise.all([
      this.prisma.legalEntity.findMany({ include: { taxRegs: true, bankAccounts: true } }),
      this.prisma.branch.findMany({ include: { offices: true, plants: { include: { warehouses: true } } }, orderBy: { name: "asc" } }),
      this.prisma.department.findMany({ include: { children: true }, where: { parentId: null }, orderBy: { name: "asc" } }),
      this.prisma.costCenter.findMany({ include: { department: true } }),
      this.prisma.profitCenter.findMany(),
      this.prisma.financialYear.findMany(),
      this.prisma.currency.findMany(),
      this.prisma.unitOfMeasure.findMany(),
      this.prisma.businessSetting.findMany(),
    ]);
    return {
      legalEntities: legalEntities.map((entity) => ({ ...entity, bankAccounts: entity.bankAccounts.map((account) => ({ ...account, accountNo: `••••${account.accountNo.slice(-4)}` })) })),
      branches,
      departments,
      costCenters,
      profitCenters,
      financialYears,
      currencies,
      units,
      settings,
    };
  }

  @Post("organization/:collection")
  @RequirePermissions("organization.create")
  async createOrg(@Param("collection") collection: string, @Body() body: unknown, @Req() req: ReqUser) {
    if (!(collection in ORG_SCHEMAS)) throw new BadRequestException("Unknown organization collection");
    return this.prisma.$transaction(async (tx) => {
      const created = await this.createOrgRow(tx, collection as OrgCollection, body);
      await this.log(req, "create", collection, created.id ?? created.code ?? "", undefined, created, tx);
      return created;
    });
  }

  @Patch("organization/settings/:key")
  @RequirePermissions("organization.edit")
  async setting(@Param("key") key: string, @Body() body: unknown, @Req() req: ReqUser) {
    if (!(key in SETTING_SCHEMAS)) throw new BadRequestException("Unknown setting");
    const raw = (body && typeof body === "object" ? (body as { value?: unknown }).value : undefined) ?? null;
    const value = parseBody(SETTING_SCHEMAS[key as keyof typeof SETTING_SCHEMAS], raw) as Prisma.InputJsonValue;
    const before = await this.prisma.businessSetting.findUnique({ where: { key } });
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.businessSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      await this.log(req, "update", "setting", key, before?.value, saved.value, tx);
      return saved;
    });
    return row;
  }

  @Delete("organization/:collection/:id")
  @RequirePermissions("organization.delete")
  async archiveOrg(@Param("collection") collection: string, @Param("id") id: string, @Req() req: ReqUser) {
    if (collection !== "branches" && collection !== "offices") throw new BadRequestException("This record is kept for audit and is not deleted");
    return this.prisma.$transaction(async (tx) => {
      const row =
        collection === "branches"
          ? await tx.branch.update({ where: { id }, data: { active: false } })
          : await tx.office.update({ where: { id }, data: { active: false } });
      await this.log(req, "archive", collection, id, { active: true }, { active: false }, tx);
      return row;
    });
  }

  /** Roles the actor may hand out: never super admin unless they are one, and never more permission than they hold. */
  private async assignableRoles(actor: AuthUser, roleKeys: string[], kind: string) {
    const keys = [...new Set(roleKeys)];
    const roles = await this.prisma.role.findMany({ where: { key: { in: keys } }, include: { permissions: { include: { permission: true } } } });
    if (roles.length !== keys.length) throw new BadRequestException("Unknown role");
    for (const role of roles) {
      if (role.kind !== kind) throw new BadRequestException(`Role ${role.key} is for ${role.kind.toLowerCase()} users`);
      if (isSuper(actor)) continue;
      if (role.key === SUPER) throw new ForbiddenException("Only a super admin can grant super admin");
      const beyond = role.permissions.map((grant) => grant.permission.key).filter((permission) => !actor.permissions.includes(permission));
      if (beyond.length) throw new ForbiddenException(`Role ${role.key} grants permissions you do not hold`);
    }
    return roles;
  }

  private async assertAccountLink(kind: string, customerId?: string) {
    if (kind !== "EXTERNAL") return;
    if (!customerId) throw new BadRequestException("Portal users must be linked to a customer account");
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new BadRequestException("Customer account not found");
  }

  private createOrgRow(tx: Tx, collection: OrgCollection, body: unknown): Promise<{ id?: string; code?: string }> {
    switch (collection) {
      case "branches": {
        const input = parseBody(ORG_SCHEMAS.branches, body);
        return tx.branch.create({ data: { code: input.code, name: input.name, region: input.region, state: input.state || null, address: input.address } });
      }
      case "offices": {
        const input = parseBody(ORG_SCHEMAS.offices, body);
        return tx.office.create({ data: { branchId: input.branchId, name: input.name, address: input.address } });
      }
      case "plants": {
        const input = parseBody(ORG_SCHEMAS.plants, body);
        return tx.plant.create({ data: { branchId: input.branchId, code: input.code, name: input.name, address: input.address } });
      }
      case "departments": {
        const input = parseBody(ORG_SCHEMAS.departments, body);
        return tx.department.create({ data: { code: input.code, name: input.name, parentId: input.parentId } });
      }
      case "cost-centers": {
        const input = parseBody(ORG_SCHEMAS["cost-centers"], body);
        return tx.costCenter.create({ data: { code: input.code, name: input.name, departmentId: input.departmentId } });
      }
      case "profit-centers": {
        const input = parseBody(ORG_SCHEMAS["profit-centers"], body);
        return tx.profitCenter.create({ data: { code: input.code, name: input.name } });
      }
      case "financial-years": {
        const input = parseBody(ORG_SCHEMAS["financial-years"], body);
        return tx.financialYear.create({ data: { label: input.label, startDate: new Date(input.startDate), endDate: new Date(input.endDate), active: input.active } });
      }
      case "currencies": {
        const input = parseBody(ORG_SCHEMAS.currencies, body);
        return tx.currency.create({ data: { code: input.code, name: input.name, symbol: input.symbol, rateToInr: input.rateToInr } });
      }
      case "units": {
        const input = parseBody(ORG_SCHEMAS.units, body);
        return tx.unitOfMeasure.create({ data: { code: input.code, name: input.name } });
      }
      case "legal-entities": {
        const input = parseBody(ORG_SCHEMAS["legal-entities"], body);
        return tx.legalEntity.create({ data: { code: input.code, name: input.name, gstin: input.gstin, pan: input.pan, address: input.address } });
      }
      case "bank-accounts": {
        const input = parseBody(ORG_SCHEMAS["bank-accounts"], body);
        return tx.bankAccount.create({ data: { legalEntityId: input.legalEntityId, bankName: input.bankName, accountNo: input.accountNo, ifsc: input.ifsc, currency: input.currency } });
      }
    }
  }
}
