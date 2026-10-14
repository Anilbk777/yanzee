import prisma from "../../config/dbConfig.js";

const customerShortInfo = {
    id: true,
    name: true,
};
const customerInfoSelect = {
    id: true,
    name: true,
    phone: true,
    email: true,
    createdAt: true,
};
export const createCustomerModel = async (storeId, data) => {
    const customer = await prisma.customer.create({
        data: {
            storeId,
            name: data.name,
            phone: data.phone,
            email: data.email,
        },
        select: customerShortInfo
    });

    return customer;
};

export const getCustomerByIdModel = async (storeId, customerId) =>
    await prisma.customer.findUnique({
        where: { storeId, id: customerId },
        select: customerInfoSelect
    });

export const getAllCustomersModel = async (storeId, search, page, limit) => {
    const filter = {};
    if (search) {
        filter.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
        ];
    }

    const [customers, totalCount] = await Promise.all([
        prisma.customer.findMany({
            where: {
                storeId,
                ...filter,
            },
            select: customerInfoSelect,
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.customer.count({
            where: {
                storeId,
                ...filter,
            },
        }),
    ]);

    return { customers, totalCount };
};

export const updateCustomerModel = async (storeId, customerId, data) => {
    const customer = await prisma.customer.update({
        where: { storeId, id: customerId },
        data,
        select: customerShortInfo
    });
    return customer;
}

export const deleteCustomerModel = async (storeId, customerId) => {
    const customer = await prisma.customer.delete({
        where: { storeId, id: customerId },
        select: customerShortInfo
    });
    return customer;
}

export const findCustomerByNumber = async (storeId, phoneNumber) => {
    const customer = await prisma.customer.findUnique({
        where: {
            storeId_phone: {
                storeId,
                phone: phoneNumber
            }
        },
        select: customerShortInfo
    });
    return customer;
}