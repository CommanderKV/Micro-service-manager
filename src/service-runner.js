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

		// Notify manager of the real service name so manager need not instantiate the service itself
		if (process.send) {
			try {
				process.send({ type: "register", name: svcInstance.name });
			} catch (e) {}
		}

		// Listen for control messages. Use a shutdownPromise to keep the runner alive until an
		// explicit `shutdown` is requested. `stop` will only stop the service but keep the
		// process alive; `start` can restart it; `shutdown` will stop and then allow exit.
		let shutdownResolve;
		const shutdownPromise = new Promise((res) => { shutdownResolve = res; });

		process.stdin && process.stdin.resume && process.stdin.resume();

		process.on("message", (msg) => {
			if (!msg || !msg.type) return;

			// Graceful stop: stop the service but DO NOT exit the process
			if (msg.type === "stop") {
				(async () => {
					if (svcInstance && typeof svcInstance.stopService === "function") {
						try {
							await svcInstance.stopService();
						} catch (e) {
							console.error("[service-runner] Error during stopService:", e);
						}
					}
				})();
				return;
			}

			// Start the service again if needed
			if (msg.type === "start") {
				(async () => {
					if (svcInstance && typeof svcInstance.startService === "function") {
						try {
							await svcInstance.startService();
						} catch (e) {
							console.error("[service-runner] Error during startService:", e);
						}
					}
				})();
				return;
			}

			// Final shutdown: stop service and allow the process to exit
			if (msg.type === "shutdown" || msg.type === "exit") {
				(async () => {
					if (svcInstance && typeof svcInstance.stopService === "function") {
						try {
							await svcInstance.stopService();
						} catch (e) {
							console.error("[service-runner] Error during stopService:", e);
						}
					}
					try { shutdownResolve(); } catch (e) { }
				})();
				return;
			}

			if (msg.type === "getStatus") {
				const payload = {
					name: svcInstance?.name,
					status: svcInstance?.status,
					uptime: typeof svcInstance?.getTotalUptime === "function" ? svcInstance.getTotalUptime() : 0,
					downtime: typeof svcInstance?.getDowntime === "function" ? svcInstance.getDowntime() : 0,
					timeSinceLoad: typeof svcInstance?.getTotalTime === "function" ? svcInstance.getTotalTime() : 0,
				};
				try {
					process.send({ type: "statusResponse", id: msg.id, payload });
				} catch (e) { }
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
		if (svcInstance && typeof svcInstance.startService === 'function') {
			await svcInstance.startService();
		} else {
			console.error('[service-runner] Service does not implement startService()');
			try { stopResolve(); } catch (e) { }
			process.exit(1);
		}

		// Wait until shutdown is requested. This keeps the process alive across `stop` calls.
		await shutdownPromise;
		process.exit(0);
	} catch (err) {
		console.error("[service-runner] Failed to run service:", err);
		process.exit(1);
	}
}

run();
