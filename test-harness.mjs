import { MicroServiceManager } from './dist/MicroServiceManager.js';

async function run() {
    const manager = new MicroServiceManager('./src/services');
    console.log('Loading services...');
    manager.loadServicesFromDirectory(manager['servicesDirectory'] || './src/services');

    // wait a bit for load to register
    await new Promise((r) => setTimeout(r, 200));

    console.log('Registered keys:', manager.listServices());
    const key = manager.listServices()[0];
    console.log('Starting', key);
    manager.startService(key);

    await new Promise((r) => setTimeout(r, 1200));

    console.log('Querying status via IPC...');
    try {
        const status = await manager.getServiceStatus(key);
        console.log('Status:', status);
    } catch (e) {
        console.error('Status error:', e);
    }

    console.log('Stopping', key);
    manager.stopService(key);

    await new Promise((r) => setTimeout(r, 800));

    console.log('Done');
}

run();
