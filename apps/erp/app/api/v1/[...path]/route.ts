import { NextRequest } from "next/server";
import { proxyApi } from "../../../../lib/proxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyApi(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
