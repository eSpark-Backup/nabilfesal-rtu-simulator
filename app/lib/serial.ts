import { SerialPort } from "serialport";

export let port: SerialPort | null = null;
export let logs: string[] = [];

export function setPort(p: SerialPort) {
  port = p;
}