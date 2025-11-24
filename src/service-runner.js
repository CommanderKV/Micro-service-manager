import { pathToFileURL } from "url";

// Simple service runner that imports a service module and calls startService()
// Usage: node service-runner.js /absolute/path/to/service.js

const servicePath = process.argv[2];
if (!servicePath) {
	console.error("[service-runner] No service path provided");
	process.exit(1);
}

let svcInstance= null;

// Forward console methods via IPC for structured logging. Do NOT duplicate by also writing
// to stdout/stderr here — the manager will receive IPC messages and handle printing.
if (process.send) {
	const levels = ["log", "info", "warn", "error"];
	for (const lvl of levels) {
		console[lvl] = (...args) => {
			try {
				// Send log message to the manager via IPC
				process.send({
					type: "log",
					level: lvl === "log" ? "info" : lvl,
					message: args.map(String).join(" "),
				});
			} catch (e) {
			// ignore
			}
		};
	}
}

// Main function to run the service
async function run() {
	try {
		// Dynamically import the service module
		const url = pathToFileURL(servicePath).href;
		const mod = await import(url);
		const ServiceClass = mod.default;
		svcInstance = new ServiceClass();

		// Listen for stop message
		process.on("message", (msg) => {
			if (msg && msg.type === "stop") {
				if (svcInstance && typeof svcInstance.stopService === "function") {
					try {
						svcInstance.stopService();
					} catch (e) {
						console.error("[service-runner] Error during stopService:", e);
					}
				}

				// Exit after attempting to stop
				process.exit(0);
			}
		});

		// Handle graceful termination signals
		process.on("SIGINT", () => {
			if (svcInstance && typeof svcInstance.stopService === "function") {
				try {
					svcInstance.stopService();
				} catch (e) {}
			}
			process.exit(0);
		});
		process.on("SIGTERM", () => {
			if (svcInstance && typeof svcInstance.stopService === "function") {
				try {
					svcInstance.stopService();
				} catch (e) {}
			}
			process.exit(0);
		});

		// Start the service
		if (svcInstance && typeof svcInstance.startService === "function") {
			await svcInstance.startService();
		} else {
			console.error("[service-runner] Service does not implement startService()");
			process.exit(1);
		}
	} catch (err) {
		console.error("[service-runner] Failed to run service:", err);
		process.exit(1);
	}
}

run();
