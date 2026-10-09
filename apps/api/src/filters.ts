import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@fixotec/db";
import type { Request, Response } from "express";
import { reportError } from "./instrument";

const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: "A record with these details already exists" },
  P2003: { status: HttpStatus.CONFLICT, message: "This record is still referenced by other records" },
  P2014: { status: HttpStatus.CONFLICT, message: "This change would break a required relation" },
  P2025: { status: HttpStatus.NOT_FOUND, message: "Record not found" },
  P2034: { status: HttpStatus.CONFLICT, message: "The record was changed concurrently; please retry" },
};

/** Maps Prisma errors to HTTP semantics and makes sure unexpected errors never leak internals to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();
    if (res.headersSent) return;
    const requestId = req.id || (req.headers["x-request-id"] as string | undefined);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE) {
        this.logger.error({ requestId, path: req.originalUrl, err: exception.message });
        reportError(exception, { requestId, path: req.originalUrl, method: req.method });
      }
      res.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && PRISMA_STATUS[exception.code]) {
      const mapped = PRISMA_STATUS[exception.code];
      this.logger.warn({ requestId, path: req.originalUrl, code: exception.code, meta: exception.meta });
      res.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message, code: exception.code });
      return;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn({ requestId, path: req.originalUrl, err: exception.message.split("\n").slice(-3).join(" ") });
      res.status(HttpStatus.BAD_REQUEST).json({ statusCode: HttpStatus.BAD_REQUEST, message: "Invalid request" });
      return;
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ requestId, path: req.originalUrl, err: error.message, stack: error.stack });
    reportError(error, { requestId, path: req.originalUrl, method: req.method });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Something went wrong. Please try again.", requestId });
  }
}
