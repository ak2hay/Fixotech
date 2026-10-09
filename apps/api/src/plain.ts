import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map } from "rxjs";
import { toPlain } from "./services";

@Injectable()
export class PlainInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((value) => toPlain(value)));
  }
}
