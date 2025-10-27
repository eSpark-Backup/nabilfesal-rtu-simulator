// app/api/connect/route.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
    startTCPServer, startTCPClient,
    startUDPServer, startUDPClient,
    startSerial
} = require("../../lib/connection.js");

export async function POST(req) {
    try {
        const body = await req.json();
        const { mode, host, port, serialPort, baud } = body || {};
        if (mode === "tcp-server") startTCPServer(port || 9000);
        else if (mode === "tcp-client") startTCPClient(host || "127.0.0.1", port || 9000);
        else if (mode === "udp-server") startUDPServer(port || 9001);
        else if (mode === "udp-client") startUDPClient(host || "127.0.0.1", port || 9001);
        else if (mode === "serial") startSerial(serialPort, baud || 115200);
        else return new Response(JSON.stringify({ ok: false, error: "unknown mode" }), { status: 400, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
