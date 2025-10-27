import { NextResponse } from "next/server";
import { port } from "../open/route";

export async function POST() {
  try {
    if (port && port.isOpen) {
      await new Promise((resolve, reject) => {
        port.close((err) => (err ? reject(err) : resolve()));
      });
      return NextResponse.json({ ok: true, message: "Port closed" });
    } else {
      return NextResponse.json({ ok: false, error: "No open port" });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
