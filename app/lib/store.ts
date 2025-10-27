import { SerialPort } from "serialport";

// This is a global object that will persist across requests in development,
// but be aware that in a production serverless environment, this
// state will be reset on each new function invocation.
// For a production app, you would need a persistent storage solution (like Redis).
export const store: {
    port: SerialPort | null;
    logs: string[];
} = {
    port: null,
    logs: [],
};