"use client";
import { useEffect, useRef, useState } from "react";

export default function SerialCommunicationPage() {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState("");

  const [currentTime, setCurrentTime] = useState<Date>(() => {
    // initialize with a random time within last 24 hours
    const now = new Date();
    const randomOffset = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - randomOffset);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000)); // add 1 sec
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch available ports
  useEffect(() => {
    async function fetchPorts() {
      const res = await fetch("http://localhost:3000/api/ports");
      const data = await res.json();
      if (data) {
        setPorts(data);
        if (data.length > 0 && !selectedPort) {
          setSelectedPort(data[0].path);
        }
      }
    }
    fetchPorts();
  }, []);

  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     try {
  //       const res = await fetch('http://localhost:3000/api/receive-message');
  //       if (res.status === 200) {
  //         const json = await res.json();
  //         console.log('Serial Data:', json);
  //         if (Array.isArray(json)) {
  //           if (json.length > 0 && json[0].data.cot == 6) {
  //             const newTime = new Date(json[0].data.timestamp);
  //             if (!isNaN(newTime.getTime())) {
  //               const formatted = json.map((msg: any) => {
  //                 return `${new Date(msg?.data?.timestamp).toLocaleString()}`;
  //               });
  //               setLogs(prev => [...prev, ...formatted]);
  //               setCurrentTime(newTime);
  //             }
  //           }
  //           if (json.length > 0 && json[0].data.cot == 5) {
  //             const res = await fetch("http://localhost:3000/api/send-message", {
  //               method: "POST",
  //               headers: { "Content-Type": "application/json" },
  //               body: JSON.stringify({ message: currentTimeRef.current, type: "time", hexStr: json[0].hexStr }),
  //             });
  //             const data = await res.json();
  //             console.log(data, "data")
  //           }
  //         }
  //       } else if (res.status === 204) {
  //         console.log('No new messages');
  //       }
  //     } catch (err: any) {
  //       console.error('Polling error:', err.message);
  //     }
  //   }, 2000); // Poll every 2 seconds

  //   return () => clearInterval(interval);
  // }, []);

  // Poll logs every 1s
  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     const res = await fetch("/api/logs");
  //     const data = await res.json();
  //     if (data.logs) {
  //       setLogs(data.logs);
  //     }
  //   }, 1000);
  //   return () => clearInterval(interval);
  // }, []);


  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3000/api/receive-message");

        if (res.status === 200) {
          const json = await res.json();

          if (Array.isArray(json) && json.length > 0) {
            const newLogs: string[] = [];

            await Promise.all(
              json.map(async (msg: any) => {
                const cot = msg?.data?.cot;
                const timestamp = msg?.data?.timestamp;
                const hexStr = msg?.hexStr;

                if (!cot || !timestamp) return;

                const parsedTime = new Date(timestamp);
                if (isNaN(parsedTime.getTime())) return;

                // Log all timestamps for display
                newLogs.push(parsedTime.toLocaleString());

                // Handle COT == 6 (update time)
                if (cot === 6) {
                  setCurrentTime(parsedTime);
                }

                // Handle COT == 5 (send message)
                if (cot === 5 && currentTimeRef.current) {
                  try {
                    const sendRes = await fetch("http://localhost:3000/api/send-message", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        message: currentTimeRef.current,
                        type: "time",
                        hexStr,
                      }),
                    });

                    const sendData = await sendRes.json();
                    console.log("Send result:", sendData);
                  } catch (sendErr) {
                    console.error("Send error:", sendErr);
                  }
                }
              })
            );

            if (newLogs.length > 0) {
              setLogs((prev) => [...prev, ...newLogs]);
            }
          }
        } else if (res.status === 204) {
          console.log("No new messages");
        }
      } catch (err: any) {
        console.error("Polling error:", err.message);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const openPort = async () => {
    const res = await fetch("http://localhost:3000/api/open-port", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portPath: selectedPort, baudRate }),
    });
    const data = await res.json();
    if (data) {
      alert(data.message)
      setIsOpen(true);
    } else {
      alert(data.message || "Failed to open port");
    }
  };

  const closePort = async () => {
    const res = await fetch("http://localhost:3000/api/close-port", { method: "POST" });
    const data = await res.json();
    if (data) {
      alert(data.message)
      setIsOpen(false);
    } else {
      alert(data.message || "Failed to close port");
    }
  };

  // const sendMessage = async () => {
  //   const res = await fetch("http://localhost:3000/api/send-message", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ message: msg + "\n" }),
  //   });
  //   const data = await res.json();
  //   if (!data) {
  //     alert(data.message || "Failed to send message");
  //   } else {
  //     setMsg("");
  //   }
  // };

  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     try {
  //       const res = await fetch('http://localhost:3000/api/receive-udp');
  //       if (res.status === 200) {
  //         const json = await res.json();
  //         if (Array.isArray(json.data)) {
  //           setLogs(prev => ([...prev, ...json.data]));
  //         }
  //       }
  //     } catch (err: any) {
  //       console.error('UDP polling error:', err.message);
  //     }
  //   }, 2000);

  //   return () => clearInterval(interval);
  // }, []);

  return (
    <div className="p-6 font-sans bg-gray-100 min-h-screen">
      {/* UDP Broadcast Communication */}
      {/*<div className="mb-4 bg-white p-4 rounded shadow">
        <h2 className="font-semibold text-lg mb-2">UDP Broadcast</h2>

        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
            className="border px-2 py-1 rounded flex-1"
          />
          <button
            onClick={async () => {
              const res = await fetch("http://localhost:3000/api/send-udp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message }),
              });
              const data = await res.json();
              setMessage("");
              alert(data.message);
            }}
            className="bg-orange-600 text-white px-3 py-1 rounded"
          >
            Send Broadcast
          </button>
        </div>
      </div> */}
      <div className="flex flex-row justify-between items-center mb-4">
        <h1 className="text-2xl font-bold mb-6">RTU Simulator</h1>
        <div className="flex flex-row items-center justify-center gap-5">
          <div className="flex flex-col items-center justify-center gap-2">
            <p>Power</p>
            <div style={isOpen ? { boxShadow: "0px 0px 6px 2px #FFFF00", backgroundColor: "#FFFF00" } : { backgroundColor: "#FFFF00" }} className={`w-[20px] h-[20px] rounded-full`} />
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <p>RX</p>
            <div style={isOpen ? { boxShadow: "0px 0px 6px 2px #FF0000", backgroundColor: "#FF0000" } : { backgroundColor: "#FF0000" }} className={`w-[20px] h-[20px] rounded-full`} />
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <p>TX</p>
            <div style={isOpen ? { boxShadow: "0px 0px 6px 2px #008000", backgroundColor: "#008000" } : { backgroundColor: "#008000" }} className={`w-[20px] h-[20px] rounded-full`} />
          </div>
        </div>
      </div>
      {/* Port Selector */}
      <div className="mb-4 bg-white p-4 rounded shadow">
        <h2 className="font-semibold text-lg mb-2">Configuration</h2>

        <div className="flex gap-2 mb-3">
          <select
            className="border px-2 py-1 rounded"
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isOpen}
          >
            <option value="">Select Port</option>
            {ports.map((p: any, i) => (
              <option key={i} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
          <select
            className="border px-2 py-1 rounded"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={isOpen}
          >
            <option value="">Select Baud Rate</option>
            {[9600, 115200].map((p: any, i) => (
              <option key={i} value={p}>
                {p}
              </option>
            ))}
          </select>
          {/* <input
            type="number"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            className="border px-2 py-1 rounded w-32"
            disabled={isOpen}
          /> */}
          {!isOpen ? (
            <button
              onClick={openPort}
              className="bg-green-500 text-white px-3 py-1 rounded"
              disabled={!selectedPort || !baudRate}
            >
              On
            </button>
          ) : (
            <button
              onClick={closePort}
              className="bg-red-500 text-white px-3 py-1 rounded"
            >
              Off
            </button>
          )}
        </div>

        {/* {isOpen && (
          <div className="flex gap-2">
            <input
              type="text"
              value={msg}
              onChange={(e) => {
                let input = e.target.value;

                // Remove all non-hex characters (keep only 0-9, A-F, a-f)
                input = input.replace(/[^0-9a-fA-F]/g, '');

                // Split into pairs of 2 characters
                const formatted = input.match(/.{1,2}/g)?.join(' ') || '';

                setMsg(formatted);
              }} placeholder="Message"
              className="border px-2 py-1 rounded flex-1"
            />
            <button
              onClick={sendMessage}
              className="bg-blue-500 text-white px-3 py-1 rounded"
            >
              Send
            </button>
          </div>
        )} */}
      </div>

      {/* Logs */}
      <div className="bg-black text-green-400 p-4 rounded-lg shadow h-64 overflow-auto font-mono text-sm">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      <div className="mt-4 text-left text-xl font-mono border border-[#fff] p-2 rounded-[6px] w-max">
        RTU Time: {currentTime.toLocaleString()}
      </div>
    </div>
  );
}
