import 'dotenv/config';
import { testDB } from "./src/config/dbConfig.js";
import app from "./app.js";
import logger from "./src/utils/logger.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await testDB();

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        })
    } catch (error) {
        logger.error({ error }, "Failed to start server");
        process.exit(1);
    }
}

await startServer();