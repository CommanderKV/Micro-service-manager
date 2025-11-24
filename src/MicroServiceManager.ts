import type { Service } from "./Service.js";
import readline from "readline";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export class MicroServiceManager {
    private services: Map<string, Service> = new Map();
    private servicesDirectory: string;

    constructor(servicesDirectory: string) {
        if (!servicesDirectory.endsWith("/")) {
            servicesDirectory += "/";
        }
        
        if (!fs.existsSync(path.join(process.cwd(), servicesDirectory))) {
            // Attempt fix
            const srcPath = path.join(process.cwd(), "src", servicesDirectory);
            const distPath = path.join(process.cwd(), "dist", servicesDirectory);
            if (fs.existsSync(distPath)) {
                this.servicesDirectory = distPath;
            } else if (fs.existsSync(srcPath)) {
                this.servicesDirectory = srcPath;
            } else {    
                // Couldn't find the directory
                console.log(`Services directory does not exist. Path: ${path.join(process.cwd(), servicesDirectory)} or ${srcPath} or ${distPath}`);
                process.exit(1);
            }
        } else {
            this.servicesDirectory = path.join(process.cwd(), servicesDirectory);
        }
    }

    /**
     * CLI interface for managing microservices.
     */
    public cliInterface(): void {
        Promise.resolve().then(async () => {
            console.log("MicroService Manager CLI");
            // Setup a readline interface
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            // Listen for commands
            rl.on("line", (input: string) => {
                // Parse the user input
                const args = input.split(" ");
                const command = args[0];
                const otherArgs = args.slice(2);

                // Service name only to be used when needing the service name
                const temp = args[1] + (otherArgs.length > 0 ? " " + otherArgs.join(" ") : "");
                const serviceName = temp.trim() == "undefined" ? undefined : temp.trim();
                
                // Handle the command
                switch (command) {
                    // Start a specific service
                    case "start":
                        if (!serviceName) {
                            rl.question(`\x1b[33mNo service name provided. Start all services? y/n: \x1b[0m`, (answer) => {
                                if (answer.toLowerCase() === "y") {
                                    this.startAllServices();
                                }
                            });
                        } else {
                            this.startService(serviceName);
                        }
                        break;

                    // Stop a specific service
                    case "stop":
                        if (!serviceName) {
                            rl.question(`\x1b[33mNo service name provided. Stop all services? y/n: \x1b[0m`, (answer) => {
                                if (answer.toLowerCase() === "y") {
                                    this.stopAllServices();
                                }
                            });
                        } else {
                            this.stopService(serviceName);
                        }
                        break;
                    
                    // Get the status of a specific service
                    case "status":
                        // Check the service name
                        if (!serviceName) {
                            console.log(`\x1b[31mPlease provide a service name.\x1b[0m`);
                            break;
                        }

                        // Get the service status
                        const service = this.getService(serviceName);
                        if (service) {
                            console.log(`\x1b[32mService ${serviceName} status: ${service.status}\x1b[0m`);
                        }
                        break;
                    
                    // Give a list of all registered services and their details
                    case "list":
                        const serviceCount = this.getServiceCount();
                        console.log(`\x1b[33mRegistered services: ${serviceCount}\x1b[0m`);

                        // Exit if no services are registered
                        if (serviceCount === 0) {
                            break;
                        }

                        // Make a table
                        const table = [];
                        for (const [name, service] of this.services.entries()) {
                            table.push({ 
                                name: name, 
                                status: service.status, 
                                uptime: this.formatDuration(service.getTotalUptime()), 
                                downtime: this.formatDuration(service.getDowntime()), 
                                timeSinceLoad: this.formatDuration(service.getTotalTime())
                            });
                        }
                        console.table(table);
                        break;

                    // Load a service or services from a given path
                    case "load":
                        // Check if the path ends with a .ts
                        if (serviceName && serviceName.endsWith(".ts")) {
                            if (!fs.existsSync(this.servicesDirectory + serviceName.replace(".ts", ".js"))) {
                                console.log(`\x1b[31mThe specified service file must be a compiled .js file. Please compile the TypeScript file first.\x1b[0m`);
                            }
                        }

                        // Get the path to load from
                        const path = this.servicesDirectory + (serviceName ?? "");
                        if (!fs.existsSync(path)) {
                            console.log(`\x1b[31mThe specified services directory does not exist: ${path}\x1b[0m`);
                            break;
                        }

                        // Load a service from a given path
                        if (path.endsWith(".js")) {
                            this.loadService(path);

                        // Load all services from a directory
                        } else if (path) {
                            if (!serviceName) {
                                rl.question(`\x1b[33mNo directory specified. Use default? y/n: \x1b[0m`, (answer) => {
                                    if (answer.toLowerCase() === "y") {
                                        this.loadServicesFromDirectory(this.servicesDirectory);
                                    } else {
                                        console.log(`\x1b[31mLoad command cancelled.\x1b[0m`);
                                    }
                                });
                            } else {
                                this.loadServicesFromDirectory(path);
                            }
                        }
                        break;

                    // Unload a specific service
                    case "unload":
                        if (!serviceName) {
                            console.log(`\x1b[31mPlease provide a service name to unload.\x1b[0m`);
                            break;
                        }
                        this.removeService(serviceName);
                        break;
                    
                    // Exit the CLI
                    case "exit":
                        console.log(`\x1b[32mExiting MicroService Manager CLI.\x1b[0m`);
                        rl.close();
                        process.exit(0);
                        break;

                    // List all available commands
                    case "help":
                        console.log(`\x1b[32mAvailable commands:\x1b[0m`);
                        console.log(`\x1b[32m\tstart <serviceName>         - Start a service\x1b[0m`);
                        console.log(`\x1b[32m\tstop <serviceName>          - Stop a service\x1b[0m`);
                        console.log(`\x1b[32m\tstatus <serviceName>        - Get the status of a service\x1b[0m`);
                        console.log(`\x1b[32m\tload [path, directory]      - Load a service or all services from a directory\x1b[0m`);
                        console.log(`\x1b[32m\tunload <serviceName>        - Unload a service\x1b[0m`);
                        console.log(`\x1b[32m\tlist                        - List all registered services\x1b[0m`);
                        console.log(`\x1b[32m\texit                        - Exit the CLI\x1b[0m`);
                        console.log(`\x1b[32m\thelp                        - Show this help message\x1b[0m`);
                        break;

                    // When enter is pressed with no command
                    case "":
                        break;
                    default:
                        console.log(`\x1b[31mUnknown command: ${command}\x1b[0m`);
                };
            });
        });
    }

    /**
     * Converts milliseconds to a human-readable duration format (HH:MM:SS.mmm).
     * @param ms The elapsed time in milliseconds
     * @returns the formatted duration string
     */
    private formatDuration(ms: number): string {
        const milliseconds = Math.floor(ms % 1000);
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));

        // Helper to left-pad numbers with zeros
        const pad = (num: number, size: number): string => {
            let s = num.toString();
            while (s.length < size) s = "0" + s;
            return s;
        };

        return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
    }

    /**
     * Loads all services from a given directory.
     * @param directory The directory to load from
     */
    public loadServicesFromDirectory(directory: string): void {
        // Read all files in the directory
        fs.readdirSync(directory).forEach((file) => {
            // Only process .js or .ts files
            if (file.endsWith(".js") || file.endsWith(".ts")) {
                const filePath = this.servicesDirectory + file;
                this.loadService(filePath);
            }
        });
    }

    /**
     * Loads a service dynamically from the given path.
     * @param path The path to the service
     */
    public loadService(path: string): void {
        const filePath = pathToFileURL(path).href;
        // Dynamically import the service module
        import(filePath).then((module) => {
            // Create an instance of the service
            const serviceInstance: Service = new module.default();
            this.addService(serviceInstance);
        }).catch((error) => {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Failed to load service from ${filePath}: ${error}\x1b[0m`);
        });
    }

    /**
     * Add a new microservice to the manager.
     * @param service The service to add
     */
    public addService(service: Service): void | Error {
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
    public getService(name: string): Service | undefined {
        const service = this.services.get(name);
        if (!service) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service '${name}' is not registered.\x1b[0m`);
            return undefined;
        }
        return service;
    }

    /**
     * Remove a registered service.
     * @param name The name of the service to remove
     */
    public removeService(name: string): void {
        // Check if the service is registered
        if (!this.services.has(name)) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is not registered.\x1b[0m`);
            return;
        }

        // Unregister the service
        this.services.delete(name);
        console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Service ${name} unregistered successfully.\x1b[0m`);
    }

    /**
     * Start a registered service.
     * @param name The name of the service to start
     */
    public startService(name: string): void {
        // Make sure the service is registered
        const service = this.services.get(name);
        if (!service) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service '${name}' is not registered.\x1b[0m`);
            return;
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
    public stopService(name: string): void {
        // Make sure the service is registered
        const service = this.services.get(name);
        if (!service) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service '${name}' is not registered.\x1b[0m`);
            return;
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