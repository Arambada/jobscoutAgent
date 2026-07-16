export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDb } = await import("./lib/db");
    const { startScheduler } = await import("./lib/scheduler");

    try {
      await initDb();
      console.log("[DB] Schema initialized");
    } catch (err) {
      console.error("[DB] Failed to initialize schema:", err);
    }

    await startScheduler();
  }
}
