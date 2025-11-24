import express, { Request, Response } from "express";
import type { Server } from "http";
import { Service } from "../Service.js";

export default class ExpressService extends Service {
    server: Server | null = null;
    constructor() {
        super("Express web server");
    }

    public async start(): Promise<void> {
        console.log("Starting Express server...");
        const app = express();

        app.use(express.json());
        app.get("/", (req: Request, res: Response) => res.send("Service is running"));
        app.get("/stop", async (req: Request, res: Response) => {
            this.stopService();
            res.send("Service is stopping");
        });
        app.get("/status", (req: Request, res: Response) => {
            res.send(`Service status: ${this.status}`);
        });

        const port = Number(process.env.PORT) || 3200;
        this.server = app.listen(port, () => console.log(`Express listening on ${port}`));
    }

    public async stop(): Promise<void> {
        if (!this.server) return;

        await new Promise<void>((resolve, reject) => {
            this.server!.close((err) => (err ? reject(err) : resolve()));
        });

        console.log("Express server stopped.");
    }
}