import prisma from "../../config/dbConfig.js";

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
        select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            profileImg: true,
            phone:true,
            gender:true,
            address:true,
            city:true,
            province:true,
            district:true,
            country:true,
        },
        where: { id: userId }
    })
}

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

