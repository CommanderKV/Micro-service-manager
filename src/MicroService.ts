
enum ServiceStatus {
    STARTING = "starting",
    RUNNING = "running",
    STOPPING = "stopping",
    STOPPED = "stopped",
    FAILED_TO_START = "failed while starting",
    FAILED_TO_STOP = "failed while stopping"
}

export abstract class MicroService {
    public name: string;
    public status: ServiceStatus = ServiceStatus.STOPPED;
    private createdAt: Date = new Date();
    private startTime: Date | null = null;
    private timeHistory: Array<{ start: Date; stop: Date }> = [];

    constructor(name: string) {
        this.name = name;
    }

    /**
     * Gets the uptime of the microservice in milliseconds.
     * @returns Uptime in milliseconds
     */
    public getUptime(): number {
        // Get the latest uptime entry
        const latestEntry = this.timeHistory[this.timeHistory.length - 1];
        if (!latestEntry) {
            return 0;
        }

        // Return the difference between stop and start time
        return latestEntry.stop.getTime() - latestEntry.start.getTime();
    }

    /**
     * Gets the total uptime of the microservice in milliseconds.
     * @returns Total uptime in milliseconds
     */
    public getTotalUptime(): number {
        // Calculate the total upTime
        let totalUptime = 0;
        for (const { start, stop } of this.timeHistory) {
            totalUptime += stop.getTime() - start.getTime();
        }

        // Return the total uptime
        return totalUptime;
    }

    /**
     * Gets the downtime of the microservice in milliseconds.
     * @returns Downtime in milliseconds
     */
    public getDowntime(): number {
        // Calculate the total downTime
        let totalUptime = 0;
        for (const { start, stop } of this.timeHistory) {
            totalUptime += stop.getTime() - start.getTime();
        }

        // Get the total time since creation
        const totalTime = new Date().getTime() - this.createdAt.getTime();
        
        // Get the total downtime by subtracting total uptime from total time
        return totalTime - totalUptime;
    }

    /**
     * Gets the total time since the microservice was created in milliseconds.
     * @returns Total time since creation in milliseconds
     */
    public getTotalTime(): number {
        return new Date().getTime() - this.createdAt.getTime();
    }

    private setStatus(status: ServiceStatus): void {
        this.status = status;
        console.log(`\x1b[33m[${new Date().toISOString()}] [STATUS] Service ${this.name} status changed to ${status}.\x1b[0m`);
    }

    /**
     * Starts the microservice.
     */
    public async startService(): Promise<void> {
        // Make sure the service is not already running
        if (this.status === ServiceStatus.RUNNING) {
            return;
        }

        // Set the status to starting
        this.setStatus(ServiceStatus.STARTING);

        // Attempt to start the service
        try {
            this.start();

        // Catch any errors that occur during startup
        } catch (error) {
            console.error(`\x1b[32m[${new Date().toISOString()}] [ERROR] Failed to start service ${this.name}: ${error}\x1b[0m`);
            this.setStatus(ServiceStatus.FAILED_TO_START);
            return;
        }

        // Start the service
        this.setStatus(ServiceStatus.RUNNING);
        this.startTime = new Date();
        console.log(`\x1b[34m[${new Date().toISOString()}] [INFO] Service ${this.name} started successfully.\x1b[0m`);
    }

    /**
     * Stops the microservice.
     */
    public async stopService(): Promise<void> {
        // Make sure the service is running before stopping it
        if (this.status !== ServiceStatus.RUNNING) {
            return;
        }

        // Set the status to stopping
        this.setStatus(ServiceStatus.STOPPING);

        // Attempt to stop the service
        try {
            this.stop();
        
        // Catch any errors that occur during shutdown
        } catch (error) {
            this.setStatus(ServiceStatus.FAILED_TO_STOP);
            console.error(`\x1b[32m[${new Date().toISOString()}] [ERROR] Failed to stop service ${this.name}: ${error}\x1b[0m`);
            return;
        }

        // Stop the service
        this.setStatus(ServiceStatus.STOPPED);

        // Add the uptime entry to the history
        this.timeHistory.push({ start: this.startTime!, stop: new Date() });
        console.log(`\x1b[34m[${new Date().toISOString()}] [INFO] Service ${this.name} stopped successfully.\x1b[0m`);
    }

    // ---- Abstract methods to be implemented by subclasses ----

    /**
     * Starts the microservice logic.
     * This is where you should implement the startup logic / main code for your microservice.
     */
    public abstract start(): Promise<void>;

    /**
     * Stops the microservice logic.
     * This is where you should implement the shutdown logic for your microservice.
     */
    public abstract stop(): Promise<void>;

}