"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(9000);
  const [serialPort, setSerialPort] = useState("COM3"); // Windows COM port
  const [baud, setBaud] = useState(115200);
  const [msg, setMsg] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  // Fetch logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/logs");
        const j = await res.json();
        setLogs(j.logs || []);
      } catch {}
    };
    fetchLogs();
    const iv = setInterval(fetchLogs, 1000);
    return () => clearInterval(iv);
  }, []);

  async function connectEthernet() {
    await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tcp-client", host, port: Number(port) }),
    });
  }

  async function connectSerial() {
    await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "serial", serialPort, baud: Number(baud) }),
    });
  }

  async function sendEthernet() {
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tcp", msg, host, port: Number(port) }),
    });
    setMsg("");
  }

  async function sendSerial() {
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "serial", msg, serialPort }),
    });
    setMsg("");
  }

  return (
    <div className="p-6 font-sans bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Ethernet & Serial Simulator</h1>

      {/* Ethernet */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Ethernet</h2>
        <div className="flex gap-2 mb-3">
          <input
            className="border rounded px-2 py-1 flex-1"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="Host"
          />
          <input
            className="border rounded px-2 py-1 w-24"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            placeholder="Port"
          />
          <button
            onClick={connectEthernet}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Connect
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="border rounded px-2 py-1 flex-1"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message"
          />
          <button
            onClick={sendEthernet}
            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
          >
            Send
          </button>
        </div>
      </div>

      {/* Serial */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Serial</h2>
        <div className="flex gap-2 mb-3">
          <input
            className="border rounded px-2 py-1 flex-1"
            value={serialPort}
            onChange={(e) => setSerialPort(e.target.value)}
            placeholder="COM Port"
          />
          <input
            className="border rounded px-2 py-1 w-28"
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            placeholder="Baud"
          />
          <button
            onClick={connectSerial}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Connect
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="border rounded px-2 py-1 flex-1"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message"
          />
          <button
            onClick={sendSerial}
            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
          >
            Send
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-black text-green-400 p-4 rounded-lg shadow h-64 overflow-auto font-mono text-sm">
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
