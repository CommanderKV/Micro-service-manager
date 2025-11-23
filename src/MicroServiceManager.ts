import type { MicroService } from "./MicroService.js";


export class MicroServiceManager {
    private services: Map<string, MicroService> = new Map();

    constructor() {}

    /**
     * Add a new microservice to the manager.
     * @param service The service to add
     */
    public addService(service: MicroService): void | Error {
        // Get the service name
        const name = service.name;

        // Check if the service is already registered
        if (this.services.has(name)) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is already registered.\x1b[0m`);
            throw new Error(`Service with name ${name} is already registered.`);
        }

        // Register the service
        this.services.set(name, service);
        console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Service ${name} registered successfully.\x1b[0m`);
    }

    /**
     * Get a registered service by name.
     * @param name The name of the service
     * @returns The service if found, otherwise undefined
     */
    public getService(name: string): MicroService | undefined {
        return this.services.get(name);
    }

    /**
     * Remove a registered service.
     * @param name The name of the service to remove
     */
    public removeService(name: string): void | Error {
        // Check if the service is registered
        if (!this.services.has(name)) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is not registered.\x1b[0m`);
            throw new Error(`Service with name ${name} is not registered.`);
        }

        // Unregister the service
        this.services.delete(name);
        console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Service ${name} unregistered successfully.\x1b[0m`);
    }

    /**
     * Start a registered service.
     * @param name The name of the service to start
     */
    public startService(name: string): void | Error {
        // Make sure the service is registered
        const service = this.services.get(name);
        if (!service) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is not registered.\x1b[0m`);
            throw new Error(`Service with name ${name} is not registered.`);
        }

        // Start the service
        service.startService();
    }

    /**
     * Starts all registered services.
     */
    public startAllServices(): void {
        for (const service of this.services.values()) {
            service.startService();
        }
    }

    /**
     * Stop a registered service.
     * @param name The name of the service to stop.
     */
    public stopService(name: string): void | Error {
        // Make sure the service is registered
        const service = this.services.get(name);
        if (!service) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is not registered.\x1b[0m`);
            throw new Error(`Service with name ${name} is not registered.`);
        }

        // Stop the service
        service.stopService();
    }

    /**
     * Stops all registered services.
     */
    public stopAllServices(): void {
        for (const service of this.services.values()) {
            service.stopService();
        }
    }

    /**
     * Get a list of all the names of the registered services.
     * @returns A list of registered service names.
     */
    public listServices(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Get a list of the statuses of all registered services.
     * @returns A list of the service statuses
     */
    public listServiceStatuses(): { name: string; status: string }[] {
        // Loop through all services and get their statuses
        const statuses: { name: string; status: string }[] = [];
        for (const [name, service] of this.services.entries()) {
            statuses.push({ name, status: service.status });
        }

        // Return the list of statuses
        return statuses;
    }

    /**
     * Get the number of registered services.
     * @returns The count of registered services.
     */
    public getServiceCount(): number {
        return this.services.size;
    }
}