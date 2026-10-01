import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import bcrypt from "bcrypt";
import { generateToken, hashToken } from "../../utils/tokenService.js";
import { deleteImagesSafely } from "../../utils/imageUpload.js";
import {
    createUser,
    getUserByEmail,
    updateUserById,
    findSessionByToken,
    createRefreshToken,
    revokeRefreshToken,
} from "./authModel.js";

// Fields a user may change on themselves. email, password and role are
// deliberately absent: email changes need verification, password has its own
// endpoint, and role must never be self-assignable.
const UPDATABLE_FIELDS = [
    "fullName",
    "phone",
    "gender",
    "country",
    "province",
    "district",
    "city",
    "address",
    "profileImg",
];

const profileImageFolder = (userId) => `users/${userId}`;


const registerUser = async (userData) => {
    const { email, password, fullName } = userData;
    logger.info({ email }, "Attempting to register user");

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
        throw new AppError("User with this email already exists", constants.Conflict);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserData = {
        ...userData,
        password: hashedPassword
    };
    const user = await createUser(newUserData);
    logger.info({ id: user.id, email: user.email }, "User registered successfully");
    return {
        statusCode: 201,
        message: "User registered successfully",
        data: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
        }
    }
}


const loginUser = async (body) => {
    const { email, password } = body;
    logger.info({ email }, "Attempting to login user");

    const existingUser = await getUserByEmail(email);
    if (!existingUser) {
        throw new AppError("Invalid email or password", constants.Unauthorized);
    }
    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
        throw new AppError("Invalid email or password", constants.Unauthorized);
    }

    const { accessToken, refreshToken, hashedRefreshToken, refreshExpiresAt } = generateToken(existingUser);

    await createRefreshToken({
        userId: existingUser.id,
        tokenHash: hashedRefreshToken,
        expiresAt: refreshExpiresAt
    });

    logger.info({ userId: existingUser.id, email: existingUser.email }, "User logged in successfully");
    return {
        statusCode: 200,
        message: "User logged in successfully",
        data: {
            accessToken,
            refreshToken,
            user: {
                id: existingUser.id,
                fullName: existingUser.fullName,
                email: existingUser.email,
                phone: existingUser.phone,
                profileImg: existingUser.profileImg,
                role: existingUser.role
            }
        }
    }
}


const refreshTokenService = async (incomingRefreshToken) => {
    logger.info("Refreshing access token");

    if (!incomingRefreshToken) {
        throw new AppError("Refresh token missing", constants.BadRequest);
    }

    const hashedIncoming = hashToken(incomingRefreshToken);
    const session = await findSessionByToken(hashedIncoming);

    if (!session || session.revoked) {
        throw new AppError("Invalid or revoked refresh token", constants.Unauthorized);
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
        throw new AppError("Refresh token expired. Please log in again.", constants.Unauthorized);
    }

    if (!session.user) {
        throw new AppError("User no longer exists", constants.Unauthorized);
    }

    // Revoke old session
    await revokeRefreshToken(hashedIncoming);

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken, hashedRefreshToken: newHashedToken, refreshExpiresAt } = generateToken(session.user);

    // Save new session
    await createRefreshToken({
        userId: session.user.id,
        tokenHash: newHashedToken,
        expiresAt: refreshExpiresAt
    });

    logger.info({ userId: session.user.id }, "New access and refresh token generated successfully.");

    return {
        statusCode: 200,
        message: "New Access and Refresh token generated successfully",
        data: {
            accessToken,
            refreshToken: newRefreshToken
        }
    }
}

const logoutService = async (incomingRefreshToken) => {
    logger.info(`Attempting to logout`);
    if (!incomingRefreshToken) {
        throw new AppError("Refresh token missing", constants.BadRequest);
    }

    const hashedIncoming = hashToken(incomingRefreshToken);
    await revokeRefreshToken(hashedIncoming);

    logger.info("User logged out successfully.");
    return {
        statusCode: 200,
        message: "User logged out successfully"
    }
}

const meService = async (user) => {
    return {
        statusCode: 200,
        message: "User profile fetched successfully",
        data: user
    }
}

const updateMeService = async (user, payload) => {
    logger.info({ userId: user.id }, "Attempting to update user profile");

    // Only the keys actually present are patched, so an omitted field keeps its
    // stored value and an explicit null clears it. fullName and phone are
    // NOT NULL in the database, and UpdateUserSchema rejects a null for either.
    const data = {};
    for (const key of UPDATABLE_FIELDS) {
        if (key in payload) {
            data[key] = payload[key] ?? null;
        }
    }

    let updatedUser;
    try {
        updatedUser = await updateUserById(user.id, data);
    } catch (error) {
        if (error?.code === "P2025") {
            throw new AppError("User not found", constants.NotFound);
        }
        throw error;
    }

    // `profileImg: null` removes the picture and destroys the asset; a new URL
    // replaces it and destroys the old one; omitting the field leaves both
    // untouched. Runs after the write and never throws, so a Cloudinary failure
    // cannot undo a committed update.
    await deleteImagesSafely({
        currentUrls: [user.profileImg],
        nextUrls: [updatedUser.profileImg],
        allowedPrefix: profileImageFolder(user.id),
    });

    logger.info({ userId: user.id }, "User profile updated successfully");

    return {
        statusCode: 200,
        message: "User profile updated successfully",
        data: updatedUser,
    }
}

export {
    registerUser,
    loginUser,
    refreshTokenService,
    logoutService,
    meService,
    updateMeService
}