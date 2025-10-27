import { NextResponse } from "next/server";
import { SerialPort } from "serialport";
import { setPort, logs } from "../../../lib/serial";

export async function POST(req: Request) {
  try {
    const { path, baudRate } = await req.json();

    const newPort = new SerialPort({ path, baudRate: baudRate || 9600 });

    newPort.on("data", (data) => {
      logs.push(data.toString());
      if (logs.length > 100) logs.shift();
    });

    setPort(newPort);

    return NextResponse.json({ ok: true, message: `Opened ${path}` });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
