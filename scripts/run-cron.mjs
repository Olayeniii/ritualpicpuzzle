import { runCronScheduler } from "../system/cron-scheduler.js";

async function main() {
  try {
    const result = await runCronScheduler();
    console.log("Cron run result:", JSON.stringify(result));
  } catch (error) {
    console.error("Cron failed:", error);
    process.exit(1);
  }
}

main();


