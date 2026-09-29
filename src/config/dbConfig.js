import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import logger from "../utils/logger.js"

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
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
export { Prisma };