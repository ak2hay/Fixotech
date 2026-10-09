export function browserApi(path: string) {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  const origin = configured || (process.env.NEXT_PUBLIC_VERCEL_ENV ? "" : "http://localhost:4000");
  return `${origin}/api/v1${path}`;
}
