const { runOfflineSimulation } = require('./lib/offline_simulator');

async function test() {
    console.log("Starting test...");
    // Override the max rows or something to test quickly
    try {
       const res = await runOfflineSimulation();
       console.log("Test finished with success!");
    } catch(e) {
       console.error("Test crashed!", e);
    }
}
test();
