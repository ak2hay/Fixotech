import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";
import { reportError } from "./instrument";
import { CrmService } from "./crm";
import { LedgerService } from "./ledger";
import { ApprovalService } from "./platform";
import { PeopleService } from "./people";
import { localDay } from "@fixotec/shared";

const QUEUE = "fixotec";
const MINUTE = 60 * 1000;
/** [scheduler id, job name, interval ms] */
const SCHEDULES: Array<[string, string, number]> = [
  ["scan-alerts", "scan", 60 * MINUTE],
  ["crm-reminders", "crm-reminders", 5 * MINUTE],
  ["crm-sequences", "crm-sequences", 15 * MINUTE],
  ["ledger-sync", "ledger-sync", 15 * MINUTE],
  ["attendance-build", "attendance-build", 60 * MINUTE],
];
const DEAD_LETTER_QUEUE = "fixotec-dead";
const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
} as const;

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private connections: IORedis[] = [];
  private worker?: Worker;
  private deadLetters?: Queue;

  constructor(
    private readonly approvals: ApprovalService,
    private readonly crm: CrmService,
    private readonly ledger: LedgerService,
    private readonly people: PeopleService,
  ) {}

  onModuleInit() {
    if (!env.REDIS_URL) {
      this.logger.warn("REDIS_URL is not set; background jobs (alert scans) are disabled");
      return;
    }
    void this.start();
  }

  /** Runs after boot so an unreachable Redis degrades jobs (and readiness) instead of blocking the API from listening. */
  private async start() {
    const connect = (name: string) => {
      const connection = new IORedis(env.REDIS_URL!, { maxRetriesPerRequest: null, connectionName: name });
      let down = false;
      connection.on("error", (error) => {
        if (down) return;
        down = true;
        this.logger.error(`Redis connection ${name} failed: ${error.message}`);
      });
      connection.on("ready", () => {
        if (down) this.logger.log(`Redis connection ${name} recovered`);
        down = false;
      });
      this.connections.push(connection);
      return connection;
    };
    try {
      const queueConnection = connect("fixotec-queue");
      const workerConnection = connect("fixotec-worker");
      const queue = new Queue(QUEUE, { connection: queueConnection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      this.deadLetters = new Queue(DEAD_LETTER_QUEUE, { connection: queueConnection, defaultJobOptions: { removeOnComplete: true, removeOnFail: false } });
      await queue.removeRepeatable("scan", { every: 60 * 60 * 1000 }, "scan-alerts").catch(() => false);
      for (const [scheduler, name, every] of SCHEDULES) {
        await queue.upsertJobScheduler(scheduler, { every }, { name, data: {}, opts: DEFAULT_JOB_OPTIONS });
      }
      this.worker = new Worker(QUEUE, (job) => this.run(job), { connection: workerConnection, concurrency: 2 });
      this.worker.on("failed", (job, error) => void this.onFailed(job, error));
      this.worker.on("error", (error) => this.logger.error(`Job worker error: ${error.message}`));
      this.logger.log(`Scheduled jobs: ${SCHEDULES.map(([, name]) => name).join(", ")}`);
    } catch (error) {
      this.logger.error(`Redis queue not started: ${(error as Error).message}`);
      reportError(error, { source: "jobs.init" });
    }
  }

  private async run(job: Job) {
    if (job.name === "scan") return this.approvals.scanAlerts();
    if (job.name === "crm-reminders") return this.crm.remind();
    if (job.name === "crm-sequences") return this.crm.runSequences();
    if (job.name === "ledger-sync") return this.ledger.syncAll();
    if (job.name === "attendance-build") return this.people.rebuild(null, localDay(new Date(Date.now() - 86_400_000)), localDay(new Date()));
    throw new Error(`Unknown job ${job.name}`);
  }

  private async onFailed(job: Job | undefined, error: Error) {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const final = job.attemptsMade >= attempts;
    this.logger.error({ msg: final ? "Job failed permanently" : "Job attempt failed", job: job.name, id: job.id, attempt: job.attemptsMade, attempts, err: error.message });
    if (!final) return;
    reportError(error, { source: "jobs", job: job.name, jobId: job.id });
    await this.deadLetters
      ?.add(job.name, { originalId: job.id, data: job.data, error: error.message, failedAt: new Date().toISOString() })
      .catch((dlqError: Error) => this.logger.error(`Dead-letter enqueue failed: ${dlqError.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.deadLetters?.close();
    await Promise.all(this.connections.map((connection) => connection.quit().catch(() => undefined)));
  }
}
