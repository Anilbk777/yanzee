import prisma from "../../config/dbConfig.js";

// The profile shape returned by /me and PATCH /me. Kept in one place so the two
// endpoints can never drift, and so `password` can never leak out of a query.
const USER_PROFILE_SELECT = {
    id: true,
    fullName: true,
    email: true,
    role: true,
    profileImg: true,
    phone: true,
    gender: true,
    address: true,
    city: true,
    province: true,
    district: true,
    country: true,
    shop: {
        select: {
            id: true,
            name: true,
            ownerId: true,
            // Loaded so requireOwner can hand the update flows the shop's
            // current image without a second query.
            image: true,
        },
    },
};

export const createUser = async (userData) => {
    return await prisma.user.create({
        data: userData
    })
}

export const getUserByEmail = async (email) => {
    return await prisma.user.findUnique({
        where: { email }
    })
}

export const getUserById = async (userId) => {
    return await prisma.user.findUnique({
        select: USER_PROFILE_SELECT,
        where: { id: userId },
    });
};

export const updateUserById = async (userId, data) => {
    return await prisma.user.update({
        where: { id: userId },
        data,
        select: USER_PROFILE_SELECT,
    });
};

export const createRefreshToken = async (data) => {
    return await prisma.refreshToken.create({
        data
    });
}

export const findSessionByToken = async (tokenHash) => {
    return await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                }
            }
        }
    })
}

export const revokeRefreshToken = async (tokenHash) => {
    return await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true }
    })
}

export const revokeAllUserRefreshTokens = async (userId) => {
    return await prisma.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true }
    })
}

