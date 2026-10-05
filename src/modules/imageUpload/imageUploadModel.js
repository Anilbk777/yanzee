import prisma from "../../config/dbConfig.js";

export const updateStoreLogoModel = (storeId, logo) =>
    prisma.store.update({
        where: { id: storeId },
        data: { logo },
        select: { id: true, name: true, slug: true, logo: true },
    });