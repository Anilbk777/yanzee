import "dotenv/config";
import express from "express";
import logger from "./src/utils/logger.js"; // Adjust this path if your folder structure is different

// 1. Import your worker to spin it up automatically
import "./src/jobs/worker/imageWorker.js"; // Replace this with the actual relative path to your worker file

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Render needs a health check endpoint to mark the deployment as "Live"
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "up",
        message: "Image background worker is active and listening to Redis queue."
    });
});

// 3. Start the dummy HTTP server
app.listen(PORT, () => {
    logger.info(`Dummy health-check server running on port ${PORT}`);
});
