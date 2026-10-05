import cron from "node-cron";
import { cleanupTempImages } from "./imageUpload.js";
import logger from "./logger.js";

export function initCronJobs() {
  cron.schedule(
    "0 1 * * *",
    () => {
      cleanupTempImages(24).catch((err) => logger.error({ err }, "Temp cleanup failed"));
    },
    {
      scheduled: true,
      timezone: "Asia/Kathmandu" //
    }
  );

  logger.info("⏰ Cron jobs initialized successfully.");
}