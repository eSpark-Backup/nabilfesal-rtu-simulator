// app/api/logs/route.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { getLogs } from "../../lib/connection.ts";

export async function GET() {
  const logs = getLogs();
  return new Response(JSON.stringify({ logs }), { status: 200, headers: { "Content-Type": "application/json" } });
}
