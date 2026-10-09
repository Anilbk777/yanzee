// src/jobs/testEnqueue.js
import "dotenv/config";
import { imageQueue } from "./src/jobs/queue/imageQueue.js"; // adjust path

const job = await imageQueue.add("delete", { publicIds: ["test/does-not-exist"] });
console.log("added job", job.id, await imageQueue.getJobCounts());
process.exit(0);