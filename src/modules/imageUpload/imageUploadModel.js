import prisma from "../../config/dbConfig.js";

export const updateUserImage = async (userId, imageUrl) => {
    const user = await prisma.user.update({
        where: {
            id: userId,
        },
        data: {
            profileImg: imageUrl,
        },
    });
    return user;
}

export const updateShopImage = async (shopId, imageUrl) => {
    const shop = await prisma.shop.update({
        where: {
            id: shopId,
        },
        data: {
            image: imageUrl,
        },
    });
    return shop;
}