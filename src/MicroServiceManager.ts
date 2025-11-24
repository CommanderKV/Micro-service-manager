import type { Service } from "./Service.js";
import readline from "readline";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { fork, ChildProcess } from "child_process";

export class MicroServiceManager {
    private services: Map<string, { path: string; child?: ChildProcess; startedAt?: number; registeredName?: string }> = new Map();
    private pendingRequests: Map<string, (payload: any) => void> = new Map();
    private servicesDirectory: string;
    private defaultGracefulShutdownMs: number = 3000;

    /**
     * The constructor for the MicroServiceManager.
     * @param servicesDirectory The directory that holds the services
     * @param defaultGracefulShutdownMs The time in ms that the service has to shutdown before being killed
     */
    constructor(servicesDirectory: string, defaultGracefulShutdownMs?: number) {
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

        if (defaultGracefulShutdownMs !== undefined) {
            this.defaultGracefulShutdownMs = defaultGracefulShutdownMs;
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
                            this.getServiceStatus(serviceName).then((status) => {
                                if (status) {
                                    console.log(`\x1b[32mService ${serviceName} status: ${status.status} uptime=${this.formatDuration(status.uptime)}\x1b[0m`);
                                }
                            }).catch((err) => {
                                console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] ${err}\x1b[0m`);
                            });
                        break;
                    
                    // Give a list of all registered services and their details
                    case "list":
                        const serviceCount = this.getServiceCount();
                        console.log(`\x1b[33mRegistered services: ${serviceCount}\x1b[0m`);

                        // Exit if no services are registered
                        if (serviceCount === 0) {
                            break;
                        }

                        // List services in a table
                        this.listServicesInTable();
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
        // Do not instantiate the service in-process. Just register the path.
        if (!fs.existsSync(path)) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service file does not exist: ${path}\x1b[0m`);
            return;
        }

        // Use the filename (without extension) as the temporary key until the child registers its real name
        const base = path.split(/[\\\/]/).pop() || path;
        const key = base.replace(/\.js$|\.ts$/i, "");
        this.services.set(key, { path });
        console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Service at ${path.slice(50)} registered as '${key}'.\x1b[0m`);
    }

    /**
     * Query the running service for status. Returns a promise that resolves with status payload
     * or rejects if service not found or not running.
     */
    public getServiceStatus(name: string, timeoutMs: number = 2000): Promise<{ name: string; status: string; uptime: number; downtime: number; timeSinceLoad: number } | null> {
        return new Promise((resolve, reject) => {
            // Find entry by key, registeredName or by path basename
            const entryKey = this.findEntryKey(name);
            if (!entryKey) {
                return reject(`Service '${name}' is not registered.`);
            }
            const entry = this.services.get(entryKey)!;

            if (!entry.child) {
                // Not running
                return resolve(null);
            }

            // Send request with unique id
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            this.pendingRequests.set(id, (payload) => {
                this.pendingRequests.delete(id);
                resolve(payload);
            });

            try {
                entry.child!.send({ type: "getStatus", id });
            } catch (e) {
                this.pendingRequests.delete(id);
                return reject(e);
            }

            // Timeout
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    return reject(`Timeout waiting for status from service '${name}'.`);
                }
            }, timeoutMs);
        });
    }

    private findEntryKey(nameOrPath: string): string | undefined {
        // Exact key
        if (this.services.has(nameOrPath)) return nameOrPath;
        // Match registeredName
        for (const [k, v] of this.services.entries()) {
            if (v.registeredName === nameOrPath) return k;
            if (v.path.endsWith(nameOrPath)) return k;
            const base = v.path.split(/[\\\/]/).pop() || v.path;
            if (base.replace(/\.js$|\.ts$/i, "") === nameOrPath) return k;
        }
        return undefined;
    }

    /**
     * Remove a registered service.
     * @param name The name of the service to remove
     */
    public removeService(name: string): void {
        // Find entry by key or registered name
        const entryKey = this.findEntryKey(name);
        if (!entryKey) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service with name ${name} is not registered.\x1b[0m`);
            return;
        }

        const entry = this.services.get(entryKey);
        // If there's a running child process, request final shutdown then kill if it doesn't exit
        if (entry && entry.child) {
            try {
                // Ask child to shutdown (will stop and then allow exit)
                entry.child.send({ type: 'shutdown' });

                // After grace period, kill if still alive
                setTimeout(() => {
                    try {
                        entry.child && entry.child.kill();
                    } catch (e) { }
                }, this.defaultGracefulShutdownMs);
            } catch (e) {
                try { entry.child.kill(); } catch (er) { }
            }
        }

        // Unregister the service
        this.services.delete(entryKey);
        console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Service ${name} unregistered successfully.\x1b[0m`);
    }

    /**
     * Start a registered service.
     * @param name The name of the service to start
     */
    public startService(name: string): void {
        const entryKey = this.findEntryKey(name);
        if (!entryKey) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service '${name}' is not registered.\x1b[0m`);
            return;
        }
        const entry = this.services.get(entryKey)!;

        // If already running in a child, ask the child to start the service (do not fork again)
        if (entry.child) {
            try {
                entry.child.send({ type: 'start' });
                entry.startedAt = Date.now();
            } catch (e) {
                console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Failed to send start to existing child for service '${name}': ${e}\x1b[0m`);
            }
            return;
        }

        // Check if the runner is available
        const runnerPath = path.join(process.cwd(), "src", "service-runner.js");
        if (!fs.existsSync(runnerPath)) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service runner not found at path: ${runnerPath}\x1b[0m`);
            return;
        }

        // Determine runtime path for the service: prefer compiled `dist` JS if a `.ts` source was registered
        let runPath = entry.path;
        if (runPath.endsWith('.ts')) {
            // Try to map a source `src/.../X.ts` to `dist/.../X.js` by replacing 'src' with 'dist'
            const parts = runPath.split(path.sep);
            const srcIdx = parts.indexOf('src');
            if (srcIdx !== -1) {
                const partsCopy = parts.slice();
                partsCopy[srcIdx] = 'dist';
                const distPath = path.join(...partsCopy).replace(/\.ts$/i, '.js');
                if (fs.existsSync(distPath)) runPath = distPath;
            }
        }

        // Fork(Start a new thread) a new child process to run the service
        const child = fork(runnerPath, [runPath], {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["pipe", "pipe", "pipe", "ipc"]
        });

        // Forward child's stdout/stderr to main process but prefix with service name and timestamp
        if (child.stdout) {
            child.stdout.on("data", (chunk: Buffer) => {
                const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    console.log(`\x1b[36m[${new Date().toISOString()}] [${name}] ${line}\x1b[0m`);
                }
            });
        }
        if (child.stderr) {
            child.stderr.on("data", (chunk: Buffer) => {
                const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    console.error(`\x1b[31m[${new Date().toISOString()}] [${name}] ${line}\x1b[0m`);
                }
            });
        }

        // Also listen for IPC messages for structured logs and control messages
        child.on("message", (msg: any) => {
            if (!msg || !msg.type) return;
            if (msg.type === "log") {
                const level = msg.level || "info";
                const out = `[${new Date().toISOString()}] [${entry.registeredName ?? name}] ${msg.message}`;
                if (level === "error") console.error(`\x1b[31m${out}\x1b[0m`);
                else if (level === "warn") console.warn(`\x1b[33m${out}\x1b[0m`);
                else console.log(`\x1b[36m${out}\x1b[0m`);
                return;
            }

            if (msg.type === "register") {
                // Child reports its real name. Move the entry key to the registered name for easier reference.
                const realName: string = msg.name;
                // Avoid clobbering an existing registered service name
                if (this.services.has(realName)) {
                    console.warn(`\x1b[33m[${new Date().toISOString()}] [WARN] Service name '${realName}' already exists; keeping original key.\x1b[0m`);
                } else {
                    console.log(`\x1b[32m[${new Date().toISOString()}] [INFO] Renaming service '${entryKey}' to '${realName}'\x1b[0m`);
                    // Re-key the map: copy entry to new key, delete old
                    this.services.set(realName, entry);
                    this.services.delete(entryKey);
                    entry.registeredName = realName;
                }
                return;
            }

            // Handle status response messages
            if (msg.type === "statusResponse") {
                const id = msg.id;
                const cb = this.pendingRequests.get(id);
                if (cb) cb(msg.payload);
                return;
            }
        });

        // Listen for child exit events
        child.on("exit", (code, signal) => {
            if (code === null && signal === null) {
                console.log(`\x1b[34m[${new Date().toISOString()}] [INFO] Service child exited normally.\x1b[0m`);
            } else if (signal === null) {
                console.log(`\x1b[34m[${new Date().toISOString()}] [INFO] Service child exited forcibly with code: ${code}.\x1b[0m`);
            } else {
                console.log(`\x1b[34m[${new Date().toISOString()}] [INFO] Service child exited with code: ${code}, signal: ${signal}\x1b[0m`);
            }

            // Clear reference and startedAt for the matching entry
            for (const [k, v] of this.services.entries()) {
                if (v.child === child) {
                    v.child = undefined;
                    v.startedAt = undefined;
                    break;
                }
            }
        });

        // Store child reference and mark start time for uptime calculations
        entry.child = child;
        entry.startedAt = Date.now();
    }

    /**
     * Starts all registered services.
     */
    public startAllServices(): void {
        for (const name of this.services.keys()) {
            this.startService(name);
        }
    }

    /**
     * Stop a registered service.
     * @param name The name of the service to stop.
     */
    public stopService(name: string): void {
        const entryKey = this.findEntryKey(name);
        if (!entryKey) {
            console.error(`\x1b[31m[${new Date().toISOString()}] [ERROR] Service '${name}' is not registered.\x1b[0m`);
            return;
        }
        const entry = this.services.get(entryKey)!;

        // If service is running in a child process, request graceful stop then kill if needed
        if (entry.child) {
            try {
                // Ask child to stop gracefully
                entry.child.send({ type: "stop" });

                // Give it a short grace period
                setTimeout(() => {
                    try {
                        entry.child && entry.child.kill();
                    } catch (e) {
                        // ignore
                    }
                }, this.defaultGracefulShutdownMs);
            } catch (e) {
                try { entry.child.kill(); } catch (er) { }
            }
            return;
        }

        // No in-process instance is kept by manager; if not running in a child, nothing to stop
        console.warn(`\x1b[33m[${new Date().toISOString()}] [WARN] Service '${name}' is not running in a child process; nothing to stop.\x1b[0m`);
    }

    /**
     * Stops all registered services.
     */
    public stopAllServices(): void {
        for (const name of this.services.keys()) {
            this.stopService(name);
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
    public listServicesInTable(): void {
        Promise.resolve().then(async () => {
            // Make a table
            const table = [];
            for (const [name, entry] of this.services.entries()) {
                // If service is running in a child process, reflect that status and compute uptime from startedAt
                const serviceData = await this.getServiceStatus(name);
                table.push({ 
                    name: entry.registeredName ?? name, 
                    status: serviceData?.status, 
                    uptime: this.formatDuration(serviceData?.uptime ?? 0), 
                    downtime: this.formatDuration(serviceData?.downtime ?? 0), 
                    timeSinceLoad: this.formatDuration(serviceData?.timeSinceLoad ?? 0)
                });
            }
            console.table(table);
        });
    }

    /**
     * Get the number of registered services.
     * @returns The count of registered services.
     */
    public getServiceCount(): number {
        return this.services.size;
    }
}