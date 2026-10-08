import 'dotenv/config';
import { testDB } from "./src/config/dbConfig.js";
import initCloudinary from "./src/config/cloudinaryConfig.js";
import {checkRedis} from "./src/config/redisConfig.js"

import app from "./app.js";
import logger from "./src/utils/logger.js";

import { initCronJobs } from "./src/utils/cornJob.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await testDB();
        initCloudinary();
        await checkRedis();
        initCronJobs();

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        })
    } catch (error) {
        logger.error({ error }, "Failed to start server");
        process.exit(1);
    }
}

await startServer();