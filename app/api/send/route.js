// app/api/send/route.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { sendTCP, sendUDP, sendSerial } = require("../../lib/connection.js");

export async function POST(req) {
    try {
        const body = await req.json();
        const { mode, msg, host, port } = body || {};
        if (mode === "tcp") sendTCP(msg || "");
        else if (mode === "udp") sendUDP(msg || "", host || "127.0.0.1", port || 9001);
        else if (mode === "serial") sendSerial(msg || "");
        else return new Response(JSON.stringify({ ok: false, error: "unknown mode" }), { status: 400, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
