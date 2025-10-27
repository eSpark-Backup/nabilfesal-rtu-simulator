// pages/api/serial/ports/route.ts
import { NextResponse } from "next/server";
import { SerialPort } from "serialport";

export async function GET() {
  try {
    const ports = await SerialPort.list();
    return NextResponse.json({ success: true, ports });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
