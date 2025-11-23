import express from "express";
import type { Request, Response } from "express";
import type { Server } from "http";
import { MicroService } from "./MicroService.js";

class test extends MicroService {
    server: Server | null = null;
    constructor() {
        super("test");
    }

    public async start(): Promise<void> {
        console.log("Starting Express server...");
        const app = express();

        app.use(express.json());
        app.get("/", (req: Request, res: Response) => res.send("Service is running"));

        const port = Number(process.env.PORT) || 3000;
        const server = app.listen(port, () => console.log(`Express listening on ${port}`));

        // store server so stop() can close it if desired
        this.server = server;
    }

    public async stop(): Promise<void> {
        console.log("Service stopped");
        if (this.server) {
            this.server.close(() => {
                console.log("Express server closed");
            });
        }
    }
}

const testService = new test();
testService.startService();
console.log(`Service status: ${testService.status}`);
setTimeout(() => {
    testService.stopService();
    console.log(`Service status: ${testService.status}`);
}, 2000);