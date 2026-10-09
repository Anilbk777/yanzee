import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

logger.info("Cloudinary configured");

export const cloudStorage = cloudinary;
export const initCloudinary = async () => {
    await cloudinary.api.ping(); // throws if the credentials are wrong
    logger.info("Cloudinary connected");
};
export default cloudinary;