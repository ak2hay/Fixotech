import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";
import { loginSchema, passwordSchema } from "@fixotec/shared";
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from "@fixotec/shared/password";
import { hashCode, isSealed, recoveryCodes, seal, unseal } from "./crypto";
import { env } from "./env";
import { AuthUser, Public, clientIp, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService } from "./services";

type Req = { headers: Record<string, string | string[] | undefined>; ip?: string };
type AuthedReq = Req & { user: AuthUser };

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const microsoftJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const SESSION_HOURS = 8;
const LOCK_AFTER = 5;
const MAX_LOCK_MINUTES = 60;
const STEP_SECONDS = 30;

const code = z.string().trim().toUpperCase().regex(/^\d{6}$|^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Enter the 6-digit code or a recovery code");
const verifySchema = z.object({ ticket: z.string().min(1).max(2000), code }).strict();
const setupSchema = z.object({ password: z.string().min(1).max(128) }).strict();
const enableSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const reauthSchema = z.object({ password: z.string().min(1).max(128), code }).strict();
const ssoSchema = z.object({ provider: z.enum(["google", "microsoft"]), idToken: z.string().min(1).max(8000) }).strict();
const changePasswordSchema = z.object({ current: z.string().min(1).max(128), next: passwordSchema }).strict();

function totpFor(email: string, secret: string) {
  return new TOTP({ issuer: "Fixotec", label: email, secret: Secret.fromBase32(secret), period: STEP_SECONDS });
}

function lockMinutes(failures: number) {
  return Math.min(MAX_LOCK_MINUTES, 2 ** Math.max(0, failures - LOCK_AFTER));
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(@Body() body: unknown, @Req() req: Req) {
    const input = parseBody(loginSchema, body);
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      dummyVerify(input.password);
      throw new UnauthorizedException("Email or password is incorrect");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      dummyVerify(input.password);
      throw new UnauthorizedException("Too many failed attempts. Try again later.");
    }
    if (!verifyPassword(input.password, user.passwordHash) || !user.active) {
      await this.recordFailure(user.id, req, "login_failed");
      throw new UnauthorizedException("Email or password is incorrect");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, passwordHash: needsRehash(user.passwordHash) ? hashPassword(input.password) : undefined },
    });
    if (user.mfaEnabled) return this.mfaChallenge(user.id);
    return this.issue(user.id, req, "password");
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("mfa/verify")
  async verifyMfa(@Body() body: unknown, @Req() req: Req) {
    const input = parseBody(verifySchema, body);
    const payload = await this.jwt.verifyAsync<{ sub: string; purpose?: string }>(input.ticket).catch(() => null);
    if (!payload || payload.purpose !== "mfa") throw new UnauthorizedException("MFA ticket expired");
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active || !user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException("MFA is not enabled");
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException("Too many failed attempts. Try again later.");
    const ok = await this.checkSecondFactor(user, input.code);
    if (!ok) {
      await this.recordFailure(user.id, req, "mfa_failed");
      throw new UnauthorizedException("Code is incorrect");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    return this.issue(user.id, req, "mfa");
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("mfa/setup")
  async setup(@Req() req: AuthedReq, @Body() body: unknown) {
    const input = parseBody(setupSchema, body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!verifyPassword(input.password, user.passwordHash)) throw new UnauthorizedException("Password is incorrect");
    if (user.mfaEnabled) throw new BadRequestException("MFA is already on. Turn it off before setting up a new device.");
    const secret = new Secret({ size: 20 });
    const totp = totpFor(user.email, secret.base32);
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaSecret: seal(secret.base32), mfaEnabled: false, mfaLastStep: null, mfaRecoveryCodes: [] } });
    await this.log(req, "mfa_setup", user.id);
    return { secret: secret.base32, otpauthUrl: totp.toString() };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("mfa/enable")
  async enable(@Req() req: AuthedReq, @Body() body: unknown) {
    const input = parseBody(enableSchema, body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (user.mfaEnabled) throw new BadRequestException("MFA is already on");
    if (!user.mfaSecret) throw new BadRequestException("Set up MFA first");
    const step = this.totpStep(user.email, unseal(user.mfaSecret), input.code);
    if (step === null) throw new BadRequestException("Code is incorrect");
    const codes = recoveryCodes();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaLastStep: step, mfaRecoveryCodes: codes.map(hashCode) } });
    await this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: this.sessionId(req) } }, data: { revokedAt: new Date() } });
    await this.log(req, "mfa_enabled", user.id);
    return { mfaEnabled: true, recoveryCodes: codes };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("mfa/disable")
  async disable(@Req() req: AuthedReq, @Body() body: unknown) {
    const input = parseBody(reauthSchema, body);
    const user = await this.reauthenticate(req, input.password, input.code);
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null, mfaRecoveryCodes: [] } });
    await this.log(req, "mfa_disabled", user.id);
    return { mfaEnabled: false };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("mfa/recovery-codes")
  async regenerateCodes(@Req() req: AuthedReq, @Body() body: unknown) {
    const input = parseBody(reauthSchema, body);
    const user = await this.reauthenticate(req, input.password, input.code);
    const codes = recoveryCodes();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: codes.map(hashCode) } });
    await this.log(req, "mfa_recovery_regenerated", user.id);
    return { recoveryCodes: codes };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("sso")
  async sso(@Body() body: unknown, @Req() req: Req) {
    const input = parseBody(ssoSchema, body);
    const identity = input.provider === "google" ? await this.googleIdentity(input.idToken) : await this.microsoftIdentity(input.idToken);
    const user = await this.linkIdentity(identity, req);
    if (!user.active) throw new UnauthorizedException("No Fixotec account is linked to that identity");
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException("Too many failed attempts. Try again later.");
    if (user.mfaEnabled) return this.mfaChallenge(user.id);
    return this.issue(user.id, req, `sso:${input.provider}`);
  }

  @Get("me")
  async me(@Req() req: AuthedReq) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: { customer: { select: { id: true, name: true, type: true, priceList: true } }, branch: true, department: true },
      omit: { passwordHash: true, mfaSecret: true, mfaRecoveryCodes: true, mfaLastStep: true, failedLogins: true, lockedUntil: true },
    });
    const sid = this.sessionId(req);
    const session = sid ? await this.prisma.session.findFirst({ where: { id: sid, userId: req.user.id }, select: { expiresAt: true } }) : null;
    return { user, permissions: req.user.permissions, roleKeys: req.user.roleKeys, sessionExpiresAt: session?.expiresAt ?? null };
  }

  @Post("logout")
  async logout(@Req() req: AuthedReq) {
    const sid = this.sessionId(req);
    if (sid) await this.prisma.session.updateMany({ where: { id: sid, userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.log(req, "logout", req.user.id);
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("password")
  async changePassword(@Req() req: AuthedReq, @Body() body: unknown) {
    const input = parseBody(changePasswordSchema, body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!verifyPassword(input.current, user.passwordHash)) {
      await this.recordFailure(user.id, req, "password_change_failed");
      throw new UnauthorizedException("Current password is incorrect");
    }
    if (input.current === input.next) throw new BadRequestException("Choose a password you have not just used");
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(input.next), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: user.id, action: "password_changed", entityType: "user", entityId: user.id, ip: clientIp(req) }, tx);
    });
    return { ok: true, ...(await this.issue(user.id, req, "password_change")) };
  }

  private async mfaChallenge(userId: string) {
    const ticket = await this.jwt.signAsync({ sub: userId, purpose: "mfa", jti: randomUUID() }, { expiresIn: "5m" });
    return { mfaRequired: true, ticket };
  }

  private async issue(userId: string, req: Req, method: string) {
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const userAgent = req.headers["user-agent"];
    const session = await this.prisma.session.create({
      data: { userId, expiresAt, ip: clientIp(req), userAgent: (Array.isArray(userAgent) ? userAgent[0] : userAgent)?.slice(0, 300) },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: userId, action: "login", entityType: "session", entityId: session.id, after: { method }, ip: clientIp(req) });
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: session.id }, { expiresIn: `${SESSION_HOURS}h` });
    return { accessToken, expiresAt };
  }

  private async recordFailure(userId: string, req: Req, action: string) {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
    if (updated.failedLogins >= LOCK_AFTER) {
      await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + lockMinutes(updated.failedLogins) * 60_000) } });
    }
    await this.audit.log({ actorId: userId, action, entityType: "user", entityId: userId, after: { failures: updated.failedLogins }, ip: clientIp(req) });
  }

  /** Returns the matched TOTP time step, or null. */
  private totpStep(email: string, secret: string, token: string) {
    const delta = totpFor(email, secret).validate({ token, window: 1 });
    if (delta === null) return null;
    return Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;
  }

  /** TOTP codes are single-use (the step must advance); recovery codes are consumed on use. */
  private async checkSecondFactor(user: { id: string; email: string; mfaSecret: string | null; mfaRecoveryCodes: string[] }, value: string) {
    if (!user.mfaSecret) return false;
    if (/^\d{6}$/.test(value)) {
      const plain = unseal(user.mfaSecret);
      const step = this.totpStep(user.email, plain, value);
      if (step === null) return false;
      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
        data: { mfaLastStep: step, mfaSecret: isSealed(user.mfaSecret) ? undefined : seal(plain) },
      });
      return claimed.count === 1;
    }
    const hashed = hashCode(value);
    if (!user.mfaRecoveryCodes.includes(hashed)) return false;
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, mfaRecoveryCodes: { has: hashed } },
      data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((item) => item !== hashed) },
    });
    return claimed.count === 1;
  }

  private async reauthenticate(req: AuthedReq, password: string, secondFactor: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException("Too many failed attempts. Try again later.");
    if (!verifyPassword(password, user.passwordHash)) {
      await this.recordFailure(user.id, req, "reauth_failed");
      throw new UnauthorizedException("Password is incorrect");
    }
    if (!user.mfaEnabled) throw new BadRequestException("MFA is not on");
    if (!(await this.checkSecondFactor(user, secondFactor))) {
      await this.recordFailure(user.id, req, "reauth_failed");
      throw new UnauthorizedException("Code is incorrect");
    }
    return user;
  }

  private sessionId(req: Req) {
    const header = req.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return undefined;
    const decoded = this.jwt.decode(token) as { sid?: string } | null;
    return decoded?.sid;
  }

  private log(req: AuthedReq, action: string, userId: string) {
    return this.audit.log({ actorId: req.user.id, action, entityType: "user", entityId: userId, ip: clientIp(req) });
  }

  private async googleIdentity(idToken: string) {
    if (!env.GOOGLE_CLIENT_ID) throw new BadRequestException("Google sign-in is not configured");
    const { payload } = await jwtVerify(idToken, googleJwks, { audience: env.GOOGLE_CLIENT_ID, issuer: ["https://accounts.google.com", "accounts.google.com"] }).catch(() => {
      throw new UnauthorizedException("Google token is invalid");
    });
    if (typeof payload.sub !== "string") throw new UnauthorizedException("Google token has no subject");
    if (typeof payload.email !== "string" || payload.email_verified !== true) throw new UnauthorizedException("Google account email is not verified");
    return { provider: "google", subject: payload.sub, email: payload.email.toLowerCase(), tenantId: typeof payload.hd === "string" ? payload.hd : undefined };
  }

  private async microsoftIdentity(idToken: string) {
    if (!env.MICROSOFT_CLIENT_ID) throw new BadRequestException("Microsoft sign-in is not configured");
    const pinned = env.MICROSOFT_TENANT_ID && !["common", "organizations", "consumers"].includes(env.MICROSOFT_TENANT_ID) ? env.MICROSOFT_TENANT_ID : undefined;
    const allowed = (env.MICROSOFT_ALLOWED_TENANTS || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!pinned && !allowed.length) throw new BadRequestException("Microsoft sign-in needs a pinned tenant");
    const jwksTenant = pinned || "common";
    let jwks = microsoftJwks.get(jwksTenant);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${jwksTenant}/discovery/v2.0/keys`));
      microsoftJwks.set(jwksTenant, jwks);
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, { audience: env.MICROSOFT_CLIENT_ID }));
    } catch {
      throw new UnauthorizedException("Microsoft token is invalid");
    }
    const tid = typeof payload.tid === "string" ? payload.tid : "";
    if (pinned ? tid !== pinned : !allowed.includes(tid)) throw new ForbiddenException("This Microsoft tenant is not allowed");
    if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new UnauthorizedException("Microsoft token issuer is invalid");
    const subject = typeof payload.oid === "string" ? payload.oid : payload.sub;
    if (typeof subject !== "string") throw new UnauthorizedException("Microsoft token has no subject");
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
    return { provider: "microsoft", subject: `${tid}:${subject}`, email, tenantId: tid };
  }

  /** Existing links win. A first sign-in links by verified email only if the account has no link for that provider yet. */
  private async linkIdentity(identity: { provider: string; subject: string; email?: string; tenantId?: string }, req: Req) {
    const linked = await this.prisma.userIdentity.findUnique({ where: { provider_subject: { provider: identity.provider, subject: identity.subject } }, include: { user: true } });
    if (linked) {
      await this.prisma.userIdentity.update({ where: { id: linked.id }, data: { lastUsedAt: new Date(), email: identity.email } });
      return linked.user;
    }
    if (!identity.email) throw new UnauthorizedException("No Fixotec account is linked to that identity");
    const user = await this.prisma.user.findUnique({ where: { email: identity.email }, include: { identities: { where: { provider: identity.provider } } } });
    if (!user || !user.active) throw new UnauthorizedException("No Fixotec account is linked to that identity");
    if (user.identities.length) throw new UnauthorizedException("This account is linked to a different identity");
    await this.prisma.userIdentity.create({ data: { userId: user.id, provider: identity.provider, subject: identity.subject, email: identity.email, tenantId: identity.tenantId, lastUsedAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: "identity_linked", entityType: "user", entityId: user.id, after: { provider: identity.provider }, ip: clientIp(req) });
    return user;
  }
}
