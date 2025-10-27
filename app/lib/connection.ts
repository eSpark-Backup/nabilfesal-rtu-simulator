// lib/connections.ts
import net from 'net';
import dgram from 'dgram';
import { SerialPort } from 'serialport';

const MAX_LOGS = 400;
const logs: string[] = [];

function addLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logs.push(line);
  if (logs.length > MAX_LOGS) logs.shift();
  console.log(line);
}

// TCP
let tcpServer: net.Server | null = null;
let tcpClient: net.Socket | null = null;

export function startTCPServer(port = 9000) {
  if (tcpServer) {
    addLog('TCP server already running');
    return;
  }

  tcpServer = net.createServer((socket) => {
    addLog('TCP client connected ' + socket.remoteAddress + ':' + socket.remotePort);

    socket.on('data', (data) => {
      addLog('TCP RX: ' + data.toString());
      try { socket.write(data); } catch (e: any) { addLog('TCP write err: ' + e.message); }
    });

    socket.on('close', () => addLog('TCP client disconnected'));
    socket.on('error', (err) => addLog('TCP socket err: ' + err.message));
  });

  tcpServer.on('error', (err) => addLog('TCP server err: ' + err.message));
  tcpServer.listen(port, () => addLog('TCP server listening on ' + port));
}

export function startTCPClient(host = '127.0.0.1', port = 9000) {
  if (tcpClient) {
    addLog('TCP client already running');
    return;
  }

  tcpClient = new net.Socket();

  tcpClient.connect(port, host, () => addLog(`TCP client connected to ${host}:${port}`));
  tcpClient.on('data', (data) => addLog('TCP RX: ' + data.toString()));
  tcpClient.on('close', () => {
    addLog('TCP client closed');
    tcpClient = null;
  });
  tcpClient.on('error', (err) => addLog('TCP client err: ' + err.message));
}

export function sendTCP(msg: string) {
  if (!tcpClient) {
    addLog('TCP client not connected');
    return;
  }
  tcpClient.write(msg);
  addLog('TCP TX: ' + msg);
}

export function stopTCPServer() {
  if (!tcpServer) return;
  tcpServer.close(() => {
    addLog('TCP server closed');
    tcpServer = null;
  });
}

export function stopTCPClient() {
  if (!tcpClient) return;
  tcpClient.destroy();
  tcpClient = null;
  addLog('TCP client destroyed');
}

// UDP
let udpSocket: dgram.Socket | null = null;

export function startUDPServer(port = 9001) {
  if (udpSocket) {
    addLog('UDP socket already running');
    return;
  }

  udpSocket = dgram.createSocket('udp4');

  udpSocket.on('message', (msg, rinfo) => {
    addLog(`UDP RX from ${rinfo.address}:${rinfo.port} - ${msg.toString()}`);
    udpSocket?.send(msg, rinfo.port, rinfo.address, (err) => {
      if (err) addLog('UDP send err: ' + err.message);
    });
  });

  udpSocket.on('error', (err) => addLog('UDP err: ' + err.message));
  udpSocket.bind(port, () => addLog('UDP server bound on ' + port));
}

export function startUDPClient(host = '127.0.0.1', port = 9001) {
  if (udpSocket) {
    addLog('UDP socket already running');
    return;
  }

  udpSocket = dgram.createSocket('udp4');
  udpSocket.on('message', (msg, rinfo) => addLog('UDP RX: ' + msg.toString()));

  udpSocket.send(Buffer.from('hello from udp client'), port, host, (err) => {
    if (err) addLog('UDP client send err: ' + err.message);
    else addLog('UDP client sent initial packet');
  });
}

export function sendUDP(msg: string, host: string, port: number) {
  if (!udpSocket) {
    addLog('UDP socket not running');
    return;
  }

  udpSocket.send(Buffer.from(msg), port, host, (err) => {
    if (err) addLog('UDP send err: ' + err.message);
    else addLog(`UDP TX to ${host}:${port} -> ${msg}`);
  });
}

export function stopUDP() {
  if (!udpSocket) return;
  udpSocket.close(() => {
    addLog('UDP socket closed');
    udpSocket = null;
  });
}

// Serial
let serialPort: SerialPort | null = null;

export async function listSerialPorts() {
  try {
    const ports = await SerialPort.list();
    return ports; // array of port info objects
  } catch (err: any) {
    addLog('Serial port list err: ' + err.message);
    return [];
  }
}

export function startSerial(portPath: string, baud = 115200) {
  if (serialPort) {
    addLog('Serial port already open');
    return;
  }

  try {
    serialPort = new SerialPort({ path: portPath, baudRate: baud });

    serialPort.on('open', () => addLog(`Serial opened ${portPath} @${baud}`));
    serialPort.on('data', (data) => addLog('SERIAL RX: ' + data.toString()));
    serialPort.on('error', (err) => addLog('Serial err: ' + err.message));
    serialPort.on('close', () => {
      addLog('Serial closed');
      serialPort = null;
    });
  } catch (e: any) {
    addLog('Serial start exception: ' + e.message);
  }
}

export function sendSerial(msg: string) {
  if (!serialPort) {
    addLog('Serial port not open');
    return;
  }
  try {
    serialPort.write(msg);
    addLog('SERIAL TX: ' + msg);
  } catch (e: any) {
    addLog('Serial write err: ' + e.message);
  }
}

export function closeSerial() {
  if (!serialPort) return;
  serialPort.close(() => {
    addLog('Serial port closed');
    serialPort = null;
  });
}

// Logs
export function getLogs() {
  return logs.slice();
}
