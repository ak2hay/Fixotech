import { env } from "./env";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthController } from "./auth";
import { CommercialController } from "./commercial";
import { ContentController } from "./content";
import { CrmController, CrmService } from "./crm";
import { AccountingController, LedgerService } from "./ledger";
import { GstController } from "./gst";
import { BankingController, BankingService, PaymentService, RazorpayClient } from "./banking";
import { GstService } from "./tax";
import { GspClient } from "./gsp";
import { EngineeringController } from "./engineering";
import { FieldController } from "./field";
import { PeopleController, PeopleService, SelfServiceController } from "./people";
import { PayrollController, PayrollSelfController, PayrollService } from "./payroll";
import { HealthController } from "./health";
import { JwtAuthGuard, PermissionsGuard } from "./http";
import { InventoryService } from "./inventory";
import { InsightController } from "./insight";
import { IdentityController } from "./identity";
import { JobsService } from "./jobs";
import { loggerParams } from "./logging";
import { OverviewController } from "./overview";
import { PlantController } from "./plant";
import { ApprovalService, PlatformController } from "./platform";
import { PrismaService } from "./prisma.service";
import { PlainInterceptor } from "./plain";
import { AuditService, DomainEventService, NotifyService, NumberService, StorageService, WorkflowService } from "./services";
import { SiteController } from "./site";
import { SupplyController } from "./supply";
import { RedisThrottlerStorage } from "./throttle";

@Module({
  imports: [
    LoggerModule.forRoot(loggerParams),
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { algorithm: "HS256", issuer: "fixotec-api" },
      verifyOptions: { algorithms: ["HS256"], issuer: "fixotec-api" },
    }),
    ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 300 }], storage: new RedisThrottlerStorage(env.REDIS_URL) }),
  ],
  controllers: [
    HealthController,
    AuthController,
    IdentityController,
    PlatformController,
    CommercialController,
    EngineeringController,
    SupplyController,
    PlantController,
    FieldController,
    InsightController,
    SiteController,
    ContentController,
    OverviewController,
    CrmController,
    AccountingController,
    GstController,
    BankingController,
    PeopleController,
    SelfServiceController,
    PayrollController,
    PayrollSelfController,
  ],
  providers: [
    PrismaService,
    AuditService,
    NumberService,
    WorkflowService,
    NotifyService,
    StorageService,
    DomainEventService,
    ApprovalService,
    InventoryService,
    CrmService,
    LedgerService,
    GstService,
    GspClient,
    PaymentService,
    BankingService,
    PeopleService,
    PayrollService,
    RazorpayClient,
    JobsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: PlainInterceptor },
  ],
})
export class AppModule {}
