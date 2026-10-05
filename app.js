import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import globalErrorHandler from "./src/middlewares/globalErrorHandler.js";
import logger from "./src/utils/logger.js";
import helmet from "helmet";
import AppError from "./src/utils/AppError.js";
import constants from "./src/utils/constants.js";
import authRouter from "./src/modules/auth/authRoute.js";
import storeRouter from "./src/modules/store/storeRoute.js";
import categoryRouter from "./src/modules/category/categoryRoute.js";
// import productRouter from "./src/modules/product/productRoute.js";
// import orderRouter from "./src/modules/orders/orderRoute.js";
// import cartRouter from "./src/modules/cart/cartRoute.js";
import imageRouter from "./src/modules/imageUpload/imageUploadRoute.js"

const app = express();

app.use(helmet());

app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true
}));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const apiPrefix = "/api/v1";

// API Routes
app.use(`${apiPrefix}/auth`, authRouter);
app.use(`${apiPrefix}/stores`, storeRouter);
app.use(`${apiPrefix}/categories`, categoryRouter);
// app.use(`${apiPrefix}/products`, productRouter);
// app.use(`${apiPrefix}/orders`, orderRouter);
// app.use(`${apiPrefix}/carts`, cartRouter);
app.use(`${apiPrefix}/images`, imageRouter)

app.get("/", (req, res) => {
    res.status(200).json({ success: true, statusCode: 200, message: "welcome to yanzee backend" })
});

app.get("/health", (req, res) => {
    res.status(200).json({ success: true, statusCode: 200, message: "yanzee backend is running" })
})

app.head("/health", (req, res) => {
    res.status(200).send()
})

// Route Not Found Handler
app.use((req, res, next) => {
    throw new AppError(` ${req.method} with ${req.originalUrl} route not found`, constants.NotFound);
});

// Global Error Handler
app.use(globalErrorHandler);

export default app;