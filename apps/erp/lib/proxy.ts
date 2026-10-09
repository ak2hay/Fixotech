import { proxyApi as forward } from "@fixotec/ui/proxy";

export function proxyApi(request: Request, path: string[]) {
  return forward(request, path, { session: true });
}
