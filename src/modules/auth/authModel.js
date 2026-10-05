import prisma from "../../config/dbConfig.js";

export const createUser = async (userData) => {
    return await prisma.user.create({
        data: userData,
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
        }
    })
}

export const getUserByEmail = async (email) => {
    return await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            password: true,
            role: true
        }
    })
}

export const getUserById = async (userId) => {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            profileImg: true,
            isActive: true,
            role: true
        },
    });
};

export const updateUserById = async (userId, data) => {
    return await prisma.user.update({
        where: { id: userId },
        data,
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

