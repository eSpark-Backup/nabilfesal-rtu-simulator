import { NextResponse } from "next/server";
import { port } from "../open/route";

export async function POST(req) {
    try {
        const { data } = await req.json();

        if (!port || !port.isOpen) {
            return NextResponse.json({ ok: false, error: "No open port" });
        }

        port.write(data, (err) => {
            if (err) console.error("Error writing:", err);
        });

        return NextResponse.json({ ok: true, message: "Data sent" });
    } catch (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
