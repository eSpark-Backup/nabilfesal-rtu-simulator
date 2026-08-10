const express = require('express');
const { SerialPort } = require('serialport');
const cors = require('cors');
const dgram = require('dgram');
const os = require('os');

const app = express();
const port = 3000;

let currentSerialPort = null;
let receivedMessages = [];
let serialBuffer = Buffer.alloc(0);
let lastMsg = "";
let isPollingActive = false;
let linkStatusSent = false;
let deviceConfigured = false;
let pollingConfigured = false;
let lastDataReceivedTime = Date.now();
let typeIds = [
  100,//100 === 64 [64 is unique type id of general interogation]
  101,//101 === 65 [65 is unique type id of counter interogation]
  ///time sync
  102,//102 === 66 [66 is unique type id of read point]
  105,//105 === 68 [68 is unique type id of test]
  104,//104 === 69 [69 is unique type id of general reset process]
  //last message
  220,//220 === DC [DC is unique type id of RTU point type]
  223,//223 === DF [DF is unique type id of memory peak]
  213, //216 === D8 [D8 is unique type id of DI parameters extended]
  // 201, //201 === C9[C9 is unique type id of DI parameters]
  // 216,//213 === D5 [D5 is unique type id of general parameters]
  221, //221 === DD[DD is unique type id of address map]
  314, //314 === CC[CC is unique type id of RTU port status]
  313, //313 === CB[CB is unique type id of RTU port configuration]
]

/**
 * Calculates checksum for IEC 60870-5-101 frame
 * @param {Buffer} buffer - Full frame buffer (must include start bytes and checksum placeholder)
 * @returns {number} - Calculated checksum (0–255)
 * @returns {Object|null} - Parsed frame info or null if invalid
 */

function parseIEC101Frame(buffer) {
  if (buffer.length < 6) {
    return { valid: false, needMoreData: true };
  }

  const startByte = buffer[0];

  if (startByte === 0x10) {
    if (buffer.length < 6) return { valid: false, needMoreData: true };
    const control = buffer[1];
    const addr1 = buffer[2];
    const addr2 = buffer[3];
    const checksum = buffer[4];
    const stop = buffer[5];

    const expected = (control + addr1 + addr2) & 0xFF;

    if (stop !== 0x16) {
      return { valid: false, type: 'fixed', error: 'Invalid stop byte', length: 6 };
    }

    if (checksum !== expected) {
      return { valid: false, type: 'fixed', error: 'Invalid checksum', length: 6 };
    }

    return { valid: true, type: 'fixed', length: 6 };
  }

  if (startByte === 0x68) {
    if (buffer.length < 6) return { valid: false, needMoreData: true };

    const len1 = buffer[1];
    const len2 = buffer[2];
    const secondStart = buffer[3];

    if (len1 !== len2) {
      return { valid: false, type: 'variable', error: 'Length bytes mismatch', length: 4 };
    }

    if (secondStart !== 0x68) {
      return { valid: false, type: 'variable', error: 'Invalid second start byte', length: 4 };
    }

    const fullLength = 6 + len1;

    if (buffer.length < fullLength) {
      return { valid: false, needMoreData: true };
    }

    const checksum = buffer[4 + len1];
    const stop = buffer[5 + len1];

    let sum = 0;
    for (let i = 4; i < 4 + len1; i++) {
      sum += buffer[i];
    }

    const expected = sum & 0xFF;

    if (checksum !== expected) {
      return { valid: false, type: 'variable', error: 'Invalid checksum', length: fullLength, checksum };
    }

    if (stop !== 0x16) {
      return { valid: false, type: 'variable', error: 'Invalid stop byte', length: fullLength };
    }

    return { valid: true, type: 'variable', length: fullLength };
  }

  return { valid: false, type: null, error: `Unknown frame start byte: 0x${startByte.toString(16)}`, length: 1 };
}

function decodeCP56Time2a(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 7) {
    throw new Error("Invalid buffer length for CP56Time2a");
  }

  const msRaw = buffer.readUInt16LE(0);
  const seconds = Math.floor(msRaw / 1000);
  const milliseconds = msRaw % 1000;
  const minute = buffer[2] & 0x3F;
  const hour = buffer[3] & 0x1F;
  const day = buffer[4] & 0x1F;
  const month = buffer[5] & 0x0F;
  const year = buffer[6] & 0x7F;

  return new Date(2000 + year, day - 1, month, hour, minute, seconds, milliseconds);
}

function decodeIEC101Frame(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Input must be a Buffer");
  }

  if (buffer.length < 23) {
    throw new Error("Buffer too short to decode IEC101 frame");
  }

  if (buffer[0] !== 0x68 || buffer[3] !== 0x68) {
    throw new Error("Invalid start bytes");
  }

  const controlField = buffer[4];

  const linkAddress = buffer.readUInt16LE(5);

  const typeId = buffer[7];

  const vsq = buffer[8];

  const cot = buffer[9];

  const ca = buffer[10];

  const ioa = buffer.readUIntLE(11, 3);

  const timestampBytes = buffer.slice(14, 21);

  const timestamp = decodeCP56Time2a(timestampBytes);

  return {
    controlField,
    linkAddress,
    typeId,
    vsq,
    cot,
    ca,
    ioa,
    timestamp,
  };
}

function performProtocolActions() {
  if (isPollingActive && !linkStatusSent) {
    const linkStatus = Buffer.from("10 0B 01 00 0C 16".replace(/\s+/g, ''), 'hex');
    const result = parseIEC101Frame(linkStatus);
    if (result.valid) {
      currentSerialPort.write(linkStatus, err => {
        if (err) {
          console.error("❌ Error sending link status:", err.message);
        } else {
          console.log("✅ Sent link status: 10 0B 01 00 0C 16", linkStatus);
        }
      });
    }
  }

  // 2️⃣ If device is configured, send the 3 ACK packets
  if (deviceConfigured) {
    const ackMessages = [
      "10 00 01 00 01 16",
      "68 65 65 68 08 01 00 DB 01 0B 01 00 00 00 01 00 01 00 02 0E 02 0D 00 00 05 00 05 3C 00 00 00 00 00 00 00 01 00 02 00 FF FF 01 00 02 80 02 02 08 02 00 14 00 00 01 00 00 00 20 00 02 01 FF 01 02 00 20 02 19 07 10 10 31 23 01 0F 02 00 05 00 02 02 02 02 00 00 00 08 FF 20 40 00 00 00 00 00 20 00 04 00 00 00 00 00 00 5A DE 16",
      "68 0B 0B 68 08 01 00 46 01 04 01 00 00 00 00 55 16"
    ];

    sendAckSequence(ackMessages);
    deviceConfigured = false; // Prevent resending
  }
}

async function sendAckSequence(messages) {
  for (const msg of messages) {
    const buffer = Buffer.from(msg.replace(/\s+/g, ''), 'hex');
    await new Promise((resolve, reject) => {
      currentSerialPort.write(buffer, err => {
        if (err) {
          console.error("❌ Error sending ACK:", err.message);
          return reject(err);
        }
        console.log("✅ Sent configured ACK:", buffer.toString('hex'));
        resolve();
      });
    });
  }

  console.log("✅ All configured ACKs sent");
}

function decodeAndRespond(hex) {
  hex = hex.toLowerCase().replace(/\s+/g, "");

  // Convert hex string to byte array
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  if (bytes[0] !== 0x68 && (bytes[7] !== 45 || bytes[7] !== 46)) return

  // --- 1️⃣ Extract IOA (13th–15th bytes, little-endian)
  const ioa = bytes[12] + (bytes[13] << 8) + (bytes[14] << 16);

  // --- 2️⃣ Extract control byte (15th byte from start)
  const controlByte = bytes[14].toString(16).padStart(2, "0");

  // --- 3️⃣ Identify control type
  let controlType;
  switch (controlByte) {
    case "05":
      controlType = "off short";
      break;
    case "09":
      controlType = "off long";
      break;
    case "06":
      controlType = "on short";
      break;
    case "0a":
      controlType = "on long";
      break;
    default:
      controlType = "unknown";
  }

  if (controlType === "unknown") {
    console.log("❌ Unknown control byte:", controlByte);
    return;
  }

  const ioaLE = bytes[12].toString(16).padStart(2, "0")

  const calcChecksum = (packet) => {
    const b = packet.split(" ").map((x) => parseInt(x, 16));
    const startIndex = b.indexOf(0x68, 1) + 1; // find second 0x68
    let sum = 0;
    for (let i = startIndex; i < b.length - 2; i++) sum += b[i];
    return (sum % 256).toString(16).padStart(2, "0").toUpperCase();
  };

  // --- 6️⃣ Build template packets dynamically
  const templatePackets = [
    "10 00 01 00 01 16", // fixed frame
    `68 0B 0B 68 08 01 00 2E 01 07 01 00 ${ioaLE} 03 ${controlByte}`,
    `68 0B 0B 68 08 01 00 2E 01 0A 01 00 ${ioaLE} 03 ${controlByte}`,
  ];

  // --- 7️⃣ Add checksum + 16
  const finalPackets = templatePackets.map((pkt) => {
    if (pkt.startsWith("10")) return pkt;
    const checksum = calcChecksum(pkt + " 00 16");
    const final = pkt + " " + checksum + " 16";
    console.log(final, "final")
    return final;
  });


  // --- 8️⃣ Send
  sendAckSequence(finalPackets);
}

function buildCP56Time2a(date) {
  const buf = Buffer.alloc(7);

  const ms = date.getMilliseconds() + date.getSeconds() * 1000;
  buf.writeUInt16LE(ms, 0);
  buf[2] = date.getMinutes();
  buf[3] = date.getHours();
  buf[4] = date.getDate();
  buf[5] = date.getMonth() + 1;
  buf[6] = date.getFullYear() - 2000;

  return buf;
}

function buildClockUpdateResponse(originalPacket, newDate) {
  const buffer = Buffer.from(originalPacket);
  buffer[4] = 0x08;

  const timeBuffer = buildCP56Time2a(newDate);
  timeBuffer.copy(buffer, buffer.length - 9);

  let checksum = 0;
  for (let i = 4; i < buffer.length - 2; i++) {
    checksum += buffer[i];
  }
  buffer[buffer.length - 2] = checksum & 0xFF;

  return buffer;
}

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*', // allow any frontend (you can restrict to 'http://localhost:3001' if needed)
}));

// Root endpoint (optional)
app.get('/', (req, res) => {
  res.status(200).json({ message: "Serial Server Running" });
});

// 1. List available serial ports
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      return res.status(404).json({ message: 'No available ports found' });
    }
    res.json(ports);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching ports', error: err.message });
  }
});

// 2. Open a serial port
app.post('/api/open-port', (req, res) => {
  const { portPath, baudRate = 9600 } = req.body;

  if (currentSerialPort) {
    return res.status(400).json({ message: 'Port already open' });
  }

  currentSerialPort = new SerialPort({
    path: portPath, baudRate, parity: 'even',
    dataBits: 8,
    stopBits: 1
  }, (err) => {
    if (err) {
      return res.status(500).json({ message: 'Error opening port', error: err.message });
    }

    currentSerialPort.on('data', (data) => {
      lastDataReceivedTime = Date.now();
      serialBuffer = Buffer.concat([serialBuffer, data]);

      while (serialBuffer.length > 0) {
        const result = parseIEC101Frame(serialBuffer);

        if (result.valid) {
          const frame = serialBuffer.slice(0, result.length);
          const hex = frame.toString('hex').toLowerCase();
          const bytes = Array.from(Buffer.from(hex, "hex"))

          // 🧠 Handle protocol state tracking
          if (hex === '104901004a16') {
            console.log("📥 Polling ACK received");
            isPollingActive = true;
            linkStatusSent = false;
            deviceConfigured = false;
          }

          if (hex === '104601004716') {
            console.log("📥 Device Configured");
            deviceConfigured = true;
            linkStatusSent = true;
            isPollingActive = false
          }

          if (hex === '107b01007c16' || hex === '105b01005c16') {
            console.log("📥 polling Configured");
            pollingConfigured = true;
            linkStatusSent = true;
            isPollingActive = false
          }

          console.log(hex, "hex")
          decodeAndRespond(hex);

          if (typeIds.includes(bytes[7])) {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([lastMsg])
          }

          // obtain last message from RTU
          if (bytes[7] === 218) { //218 === DA [DA is unique type id of last message from RTU]
            sendAckSequence([lastMsg])
          }

          //Refresh Digital output parameters
          if (bytes[7] === 202 || bytes[7] === 217) { //202 === CA [CA is unique type id of DO parameters] //217 === D9 [D9 is unique type id of DO parameters extended]
            const doPackets = ["68101068530100ca0105010001000000640014912f16", "68101068730100d98105010001000019009600038716", "68101068730100ca0105010001000000640014914f16", "68101068530100d98105010001000019009600036716", "68101068530100ca0105010001060000640014913516", "68101068730100d98105010001060019009600038d16", "68101068730100ca0105010001060000640014915516", "68101068530100d98105010001060019009600036d16",
              "680f0f68530100ca01050100010000640014912f16", "680f0f68730100d981050100010019009600038716", "680f0f68730100ca01050100010000640014914f16", "680f0f68530100d981050100010019009600036716", "680f0f68530100ca0105010001060000640014913516", "680f0f68730100d98105010001060019009600038d16", "680f0f68730100ca0105010001060000640014915516", "680f0f68530100d98105010001060019009600036d16"
            ]
            // if (doPackets.includes(hex)) {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([
              lastMsg,
              "68 65 65 68 08 01 00 DB 01 0B 01 00 00 00 01 00 01 00 02 0E 02 0D 00 00 05 00 05 3C 00 00 00 00 00 00 00 01 00 02 00 FF FF 01 00 02 80 02 02 08 02 00 14 00 00 01 00 00 00 20 00 02 01 FF 01 02 00 20 02 19 07 10 13 0F 23 01 0F 02 00 05 00 02 02 02 02 00 00 00 08 FF 20 40 00 00 00 00 00 20 00 04 00 00 00 00 00 00 5A BF 16",
              "68 6A 6A 68 08 01 00 CA 90 05 01 00 01 00 00 64 00 19 00 F9 00 64 00 19 00 E9 00 64 00 19 00 F9 00 64 00 19 00 E9 00 64 00 19 00 F9 00 64 00 19 00 E9 00 64 00 19 00 F9 00 64 00 19 00 E9 00 64 00 19 00 F9 00 64 00 19 00 E9 00 64 00 19 00 D9 00 64 00 19 00 D9 00 64 00 19 00 D9 00 64 00 19 00 D9 00 64 00 19 00 D9 00 64 00 19 00 D9 BA 16",
              "68 5A 5A 68 08 01 00 D9 90 05 01 00 01 00 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 23 00 96 00 03 39 16"
            ])
            // } else {
            //   lastMsg = "10 00 01 00 01 16"
            //   sendAckSequence([lastMsg])
            // }
          }

          //Refresh Digital input parameters
          if (bytes[7] === 201 || bytes[7] === 216) { //201 === C9 [C9 is unique type id of DI parameters] //216 === D8 [D8 is unique type id of DI parameters extended]
            const diPackets = ["68101068530100d8810501000200000505c000018016", "68121268530100c90105010000000050030005640100e116", "680f0f68530100d88105010002001e0ae50001c316", "68111168730100c9010501000006500300056401000716", "68121268730100c901050100000000500300056401000116", "68121268730100c901050100000600180300051e01008916", "68101068530100d8810501000200001e0ae50001c316", "68121268530100c901050100000000180300051e01006316", "68101068730100d8810501000200000505c00001a016"]
            // if (diPackets.includes(hex)) {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([
              lastMsg,
              "68 65 65 68 08 01 00 DB 01 0B 01 00 00 00 01 00 01 00 02 0E 02 0D 00 00 05 00 05 3C 00 00 00 00 00 00 00 01 00 02 00 FF FF 01 00 02 80 02 02 08 02 00 14 00 00 01 00 00 00 20 00 02 01 FF 01 02 00 20 02 19 07 10 13 0F 23 01 0F 02 00 05 00 02 02 02 02 00 00 00 08 FF 20 40 00 00 00 00 00 20 00 04 00 00 00 00 00 00 5A BF 16",
              "68 EA EA 68 08 01 00 C9 A0 05 01 00 21 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 20 C8 40 05 64 03 00 20 C8 00 05 64 03 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 01 00 00 C8 40 05 00 21 00 D9 16",
              "68 0F 0F 68 08 01 00 D8 01 05 01 00 02 00 01 05 05 00 01 F6 16"
            ])
            // } else {
            //   lastMsg = "10 00 01 00 01 16"
            //   sendAckSequence([lastMsg])
            // }
          }

          // // buffer won't reset
          // if (hex === "680c0c68530100690106010002000001c816" || hex === "680c0c68730100690106010002000001e816") {
          //   // sendAckSequence(["10 00 01 00 01 16"])
          //   lastMsg = "10 00 01 00 01 16"
          //   sendAckSequence([lastMsg])
          // }

          // // buffer will reset
          // if (hex === "680c0c68530100690106010002000002c916" || hex === "680c0c68730100690106010002000002e916") {
          //   lastMsg = "10 00 01 00 01 16"
          //   sendAckSequence([lastMsg])
          // }

          // /////////////FOR IOA = 1001
          // // off short 
          // if (hex === "680b0b687301002e01060100e903059b16" || hex === "680b0b685301002e01060100e903057b16") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 E9 03 05 31 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 E9 03 05 34 16"])
          // }
          // // off long
          // if (hex === "680b0b685301002e01060100e903097f16" || hex === "680b0b687301002e01060100e903099f16") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 E9 03 09 35 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 E9 03 09 38 16"])
          // }
          // // on short
          // if (hex === "680b0b685301002e01060100e903067c16" || hex === "680b0b687301002e01060100e903069c16") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 E9 03 06 32 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 E9 03 06 35 16"])
          // }
          // // on long
          // if (hex === "680b0b685301002e01060100e9030a8016" || hex === "680b0b687301002e01060100e9030aa016") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 E9 03 0a 36 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 E9 03 0a 39 16"])
          // }
          // /////////////FOR IOA = 1003
          // // off short 
          // if (hex === "680b0b685301002e01060100eb03057d16" || hex === "680b0b687301002e01060100eb03059d16") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 EB 03 05 33 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 EB 03 05 36 16"])
          // }
          // // off long
          // if (hex === "680b0b685301002e01060100eb03098116" || hex === "680b0b687301002e01060100eb0309a116") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 EB 03 09 37 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 EB 03 09 3A 16"])
          // }
          // // on short
          // if (hex === "680b0b685301002e01060100eb03067e16" || hex === "680b0b687301002e01060100eb03069e16") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 EB 03 06 34 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 EB 03 06 37 16"])
          // }
          // // on long
          // if (hex === "680b0b685301002e01060100eb030a8216" || hex === "680b0b687301002e01060100eb030aa216") {
          //   sendAckSequence(["10 00 01 00 01 16", "68 0B 0B 68 08 01 00 2E 01 07 01 00 EB 03 0a 38 16", "68 0B 0B 68 08 01 00 2E 01 0A 01 00 EB 03 0a 3b 16"])
          // }

          // console.log(decodeIEC101Frame3(Buffer.from(hex, 'hex')), "decodeedhex")

          // if (decodeIEC101Frame2(Buffer.from(hex, 'hex')).frameType === "variable") {
          //   lastMsg = "10 00 01 00 01 16"
          //   sendAckSequence([lastMsg])
          // }

          // reset of user process
          if (hex === "104101004216") {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([lastMsg])
          }

          // test for link
          if (hex === "105201005316" || hex === "107201007316") {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([lastMsg])
          }

          // send confirm user data
          if (hex === "105301005416" || hex === "107301007416") {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([lastMsg])
          }

          // send confirm user data
          if (hex === "105301005416" || hex === "107301007416") {
            lastMsg = "10 00 01 00 01 16"
            sendAckSequence([lastMsg])
          }

          // polling packets after polling started
          if (hex === "105501005616" || hex === "107501007616") {
            lastMsg = "10 0B 01 00 0C 16"
            sendAckSequence([lastMsg])
          }

          receivedMessages.push(hex);
          serialBuffer = serialBuffer.slice(result.length);
        } else if (result.needMoreData) {
          break;
        } else {
          serialBuffer = serialBuffer.slice(result.length || 1);
        }
      }

      // Limit stored messages
      if (receivedMessages.length > 100) receivedMessages.shift();

      // 🔁 Trigger follow-up actions based on state
      performProtocolActions();
    });




    currentSerialPort.on('error', (err) => {
      console.error('Serial error:', err.message);
    });

    currentSerialPort.on('close', () => {
      console.log('Serial port closed');
      currentSerialPort = null;
    });

    res.json({ message: `Port ${portPath} opened at ${baudRate} baud` });
  });
});

const INACTIVITY_TIMEOUT_MS = 1000; // stop if no data in 1 seconds

setInterval(() => {
  const now = Date.now();
  const timeSinceLastData = now - lastDataReceivedTime;

  if (pollingConfigured && timeSinceLastData > INACTIVITY_TIMEOUT_MS) {
    console.log("⛔️ No data received in last 5 seconds. Stopping periodic ACKs.");
    pollingConfigured = false;
  }
}, 1000);

const ACK_INTERVAL_MS = 500;
const ackMsg = "10 09 01 00 0A 16";
const ackBuffer = Buffer.from(ackMsg.replace(/\s+/g, ''), 'hex');

setInterval(() => {
  if (currentSerialPort && currentSerialPort.isOpen && pollingConfigured) {
    const result = parseIEC101Frame(ackBuffer)
    if (result.valid) {
      currentSerialPort.write(ackBuffer, (err) => {
        if (err) {
          // console.error('❌ Failed to send ACK:', err.message);
        } else {
          // console.log('✅ Periodic ACK sent:', ackBuffer.toString('hex'));
        }
      });
    }
  }
}, ACK_INTERVAL_MS);

// 3. Send message over serial port
app.post('/api/send-message', (req, res) => {
  const { message, type, hexStr } = req.body;

  if (!currentSerialPort || !currentSerialPort.isOpen) {
    return res.status(400).json({ message: 'No open serial port' });
  }

  if (type === "time") {

    const originalBuffer = Buffer.from(hexStr, 'hex');

    let date;
    if (message instanceof Date) {
      date = message;
    } else {
      date = new Date(message);
    }

    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date from frontend' });
    }

    const updatedPacket = buildClockUpdateResponse(originalBuffer, new Date(date));
    console.log(updatedPacket, hexStr)

    try {
      sendAckSequence([updatedPacket.toString("hex").toUpperCase()]);
      res.json({ message: `Time Message sent` });
    } catch (err) {
      return res.status(500).json({ message: 'Error sending message', error: err.message });
    }
  } else {

    // Step 1: Clean and convert hex string to Buffer
    const cleaned = message.replace(/\s+/g, ''); // Remove spaces
    const buffer = Buffer.from(cleaned, 'hex'); // Convert to Buffer

    // Step 2: Parse IEC frame
    const result = parseIEC101Frame(buffer);

    if (!result.valid) {
      const errorMsg = `❌ Invalid ${result.type} frame: ${result.error}`
      res.status(400).json({ message: errorMsg });
    } else {
      currentSerialPort.write(buffer, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Error sending message', error: err.message });
        }
        res.json({ message: `Message sent: ${message}` });
      });
    }
  }
});

app.get('/api/receive-message', (req, res) => {
  if (!currentSerialPort || !currentSerialPort.isOpen) {
    return res.status(400).json({ message: 'No open serial port' });
  }

  if (receivedMessages.length === 0) {
    return res.status(204).json({ message: 'No new messages' });
  }

  const decoded = receivedMessages.map(hexStr => {
    try {
      return { data: decodeIEC101Frame(Buffer.from(hexStr, 'hex')), hexStr };
    } catch {
      return { raw: hexStr, error: "Decode failed" };
    }
  });

  // Clear buffer after returning
  receivedMessages = [];
  res.status(200).json(decoded);
});


// 5. Close the serial port
app.post('/api/close-port', (req, res) => {
  if (!currentSerialPort) {
    return res.status(400).json({ message: 'No port is open' });
  }

  currentSerialPort.close((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error closing port', error: err.message });
    }
    currentSerialPort = null;
    res.json({ message: 'Port closed successfully' });
  });
});

// Send UDP broadcast
const udpSocket = dgram.createSocket('udp4');
const UDP_PORT = 41234;
const BROADCAST_ADDR = '255.255.255.255';
let udpReceivedMessages = [];

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const ifaceName in interfaces) {
    for (const iface of interfaces[ifaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();
console.log(`🌐 Local IP detected: ${localIp}`);

udpSocket.bind(UDP_PORT, () => {
  udpSocket.setBroadcast(true);
  console.log(`📡 UDP socket listening on port ${UDP_PORT}`);
});

udpSocket.on('message', (msg, rinfo) => {
  const senderIp = rinfo.address;
  const message = msg.toString().trim();

  if (senderIp === localIp) {
    // Ignore own message
    return;
  }

  console.log(`📥 UDP Received from ${senderIp}:`, message);
  udpReceivedMessages.push(`[${senderIp}] ${message}`);
  if (udpReceivedMessages.length > 100) udpReceivedMessages.shift();
});

app.post('/api/send-udp', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const buffer = Buffer.from(message);
  udpSocket.send(buffer, 0, buffer.length, UDP_PORT, BROADCAST_ADDR, (err) => {
    if (err) {
      console.error('❌ UDP send error:', err.message);
      return res.status(500).json({ message: 'Failed to send UDP message', error: err.message });
    }
    console.log(`📤 UDP Broadcast sent: ${message}`);
    res.json({ message: 'UDP message sent successfully' });
  });
});

// Receive messages
app.get('/api/receive-udp', (req, res) => {
  if (udpReceivedMessages.length === 0) {
    return res.status(204).json({ message: 'No new UDP messages' });
  }

  const messages = [...udpReceivedMessages];
  udpReceivedMessages = [];

  res.status(200).json({ data: messages });
});

// Start server
app.listen(port, () => {
  console.log(`✅ Serial server running at http://localhost:${port}`);
});