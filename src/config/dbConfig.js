import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import logger from "../utils/logger.js";

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const testDB = async () => {
    try {
        await prisma.$connect();
        logger.info('Database connected');
    } catch (error) {
        logger.error({ error }, 'Database connection failed');
        process.exit(1);
    }
};

export default prisma;