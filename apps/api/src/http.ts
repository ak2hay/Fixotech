import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
type Parser<T> = { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } };
import { PrismaService } from "./prisma.service";

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const PERMS = "perms";
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMS, perms);

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  kind: string;
  customerId: string | null;
  permissions: string[];
  roleKeys: string[];
};

export function parseBody<T>(schema: Parser<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

export function pageOf(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const q = String(query.q || "").trim();
  const status = String(query.status || "").trim();
  return { page, pageSize, skip: (page - 1) * pageSize, q, status };
}

export function can(user: AuthUser, permission: string) {
  return user.permissions.includes(permission);
}

export function assertCan(user: AuthUser, permission: string) {
  if (!can(user, permission)) throw new ForbiddenException(`Missing permission ${permission}`);
}

export function isExternal(user: AuthUser) {
  return user.kind === "EXTERNAL";
}

/** For internal-only data behind permissions that portal roles also hold (e.g. payments.view for distributors). */
export function assertStaff(user: AuthUser) {
  if (isExternal(user)) throw new ForbiddenException("This information is internal to Fixotec");
}

export function seesCost(user: AuthUser) {
  return !isExternal(user) && can(user, "products.view_cost");
}

/**
 * Express resolves `req.ip` from X-Forwarded-For only for hops listed in `trust proxy` (see main.ts),
 * so a client cannot spoof its address by sending the header itself.
 */
export function clientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
  return req.ip?.replace(/^::ffff:/, "") || undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith("Bearer ")) {
      if (isPublic) return true;
      throw new UnauthorizedException("Sign in required");
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid?: string; purpose?: string }>(header.slice(7));
      if (payload.purpose === "mfa" || !payload.sid) {
        if (isPublic) return true;
        throw new UnauthorizedException("Sign in required");
      }
      const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException("Session expired");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      if (!user || !user.active) throw new UnauthorizedException("User inactive");
      const permissions = new Set<string>();
      const roleKeys: string[] = [];
      for (const link of user.roles) {
        roleKeys.push(link.role.key);
        for (const grant of link.role.permissions) permissions.add(grant.permission.key);
      }
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        kind: user.kind,
        customerId: user.customerId,
        permissions: [...permissions],
        roleKeys,
      } satisfies AuthUser;
      return true;
    } catch (error) {
      if (isPublic) return true;
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Sign in required");
    }
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS, [context.getHandler(), context.getClass()]) || [];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) {
      if (isPublic && !required.length) return true;
      throw new UnauthorizedException("Sign in required");
    }
    if (!required.length) return true;
    const missing = required.filter((permission) => !user.permissions.includes(permission));
    if (missing.length) throw new ForbiddenException(`Missing permission ${missing.join(", ")}`);
    return true;
  }
}
