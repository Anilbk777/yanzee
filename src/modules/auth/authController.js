import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { setCookie, clearCookie } from "../../utils/cookie.js";
import {
    registerUser,
    loginUser,
    refreshTokenService,
    logoutService,
    meService,
} from "./authService.js";

export const registerUserController = asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    ApiResponse(res, result);
})

export const loginController = asyncHandler(async (req, res) => {
    const result = await loginUser(req.body);
    setCookie(res, { accessToken: result.data.accessToken, refreshToken: result.data.refreshToken });
    ApiResponse(res, result);
})

export const refreshTokenController = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const result = await refreshTokenService(incomingRefreshToken);
    setCookie(res, { accessToken: result.data.accessToken, refreshToken: result.data.refreshToken });
    ApiResponse(res, result);
})

export const logoutController = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const result = await logoutService(incomingRefreshToken);
    clearCookie(res);
    ApiResponse(res, result);
})

export const meController = asyncHandler(async (req, res) => {
    const result = await meService(req.user);
    ApiResponse(res, result);
})
