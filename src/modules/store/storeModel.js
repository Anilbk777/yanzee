import prisma from "../../config/dbConfig.js";

const storeSelect = {
    id: true,
    name: true,
    slug: true,
    logo: true,
    status: true,
    isPublished: true,
    category: true,
};

const storeDetailsSelect = {
    id: true,
    name: true,
    slug: true,
    status: true,
    isPublished: true,
    category: true,
    logo: true,
    seoImage: true,
    storeAddress: true,
    contactPhone: true,
    contactEmail: true,
    createdAt: true,
    updatedAt: true,
}


// Creates the store and the owner's membership in one atomic query
export const createStoreModel = (userId, data) =>
    prisma.store.create({
        data: {
            ...data,
            members: { create: { userId } },
            outlets: {
                create: {
                    name: "Main Outlet",
                    address: data.storeAddress,
                    contactPhone: data.contactPhone,
                    isMain: true,
                },
            },
        },
        select: { id: true, name: true, slug: true },
    });

export const getStoresModel = async (userId) => {
    const memberships = await prisma.storeMember.findMany({
        where: { userId },
        select: { store: { select: storeSelect } },
    });
    return memberships.map((m) => m.store);
};

// export const getStoreByIdModel = async (userId, storeId) =>
//     prisma.store.findFirst({
//         where: { id: storeId, members: { some: { userId } } },
//         select: storeSelect,
//     });

export const getStoreByIdModel = async (userId, storeId) => {
    const membership = await prisma.storeMember.findUnique({
        where: { storeId_userId: { storeId, userId } },
        select: { store: { select: storeSelect } },
    });
    return membership?.store ?? null;
};

// P2025 = store not found or user isn't a member
export const updateStoreDetailModel = (userId, storeId, data) =>
    prisma.store.update({
        where: { id: storeId, members: { some: { userId } } },
        data,
        select: {
            id: true,
            name: true,
            isPublished: true,
            updatedAt: true,
        },
    });

// P2025 = not found / not a member, P2003 = foreign key blocked the delete
export const deleteStoreModel = (userId, storeId) =>
    prisma.store.delete({
        where: { id: storeId, members: { some: { userId } } },
        select: { id: true, name: true, logo: true, seoImage: true },
    });

export const getStoreInfoModel = async (userId, storeId) => {
    const membership = await prisma.storeMember.findUnique({
        where: { storeId_userId: { storeId, userId } },
        select: { store: { select: storeDetailsSelect } },
    });
    return membership?.store ?? null;
};