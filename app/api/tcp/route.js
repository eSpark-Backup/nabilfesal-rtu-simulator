import net from "net";

let serverStarted = false;

export async function GET() {
  if (!serverStarted) {
    const server = net.createServer((socket) => {
      console.log("Client connected");

      socket.on("data", (data) => {
        console.log("Received:", data.toString());
        socket.write("Echo: " + data); // send response back
      });

      socket.on("end", () => {
        console.log("Client disconnected");
      });
    });

    server.listen(9000, "127.0.0.1", () => {
      console.log("TCP Server running at 127.0.0.1:9000");
    });

    serverStarted = true;
  }

  return new Response(
    JSON.stringify({ status: "TCP server started on 127.0.0.1:9000" }),
    { status: 200 }
  );
}
