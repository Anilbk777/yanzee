import prisma from "../../config/dbConfig.js";

const outletSelect = {
    id: true, name: true, address: true, contactPerson: true, contactPhone: true,
    isMain: true, isActive: true, createdAt: true, updatedAt: true,
};
const outletInfo = {
    id:true,name:true
}

// P2002 = name already used in this store
export const createOutletModel = (storeId, data) =>
    prisma.outlet.create({ data: { ...data, storeId }, select: outletInfo });

export const getOutletsModel = async (storeId, { page, limit, search, isActive }) => {
    const where = {
        storeId,
        ...(isActive !== undefined && { isActive }),
        ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    const [items, total] = await Promise.all([
        prisma.outlet.findMany({
            where,
            select: outletSelect,
            orderBy: [{ isMain: "desc" }, { createdAt: "asc" }, { id: "asc" }], // main outlet always first
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.outlet.count({ where }),
    ]);

    return { items, total };
};

export const getOutletByIdModel = (storeId, outletId) =>
    prisma.outlet.findUnique({ where: { id: outletId, storeId }, select: outletSelect });

// P2025 = not found, P2002 = name taken
export const updateOutletModel = (storeId, outletId, data) =>
    prisma.outlet.update({ where: { id: outletId, storeId }, data, select: outletInfo });

// The main outlet can't be deactivated: the where clause excludes it, so P2025 is returned
export const setOutletStatusModel = (storeId, outletId, data) =>
    prisma.outlet.update({
        where: { id: outletId, storeId, isMain: false },
        data,
        select: { id: true, name: true, isActive: true },
    });

// The main outlet can't be deleted. P2025 = not found or main, P2003 = stock/orders still reference it
export const deleteOutletModel = (storeId, outletId) =>
    prisma.outlet.delete({
        where: { id: outletId, storeId, isMain: false },
        select: outletInfo,
    });

// ---------- failure path only ----------
export const getOutletFlagsModel = (storeId, outletId) =>
    prisma.outlet.findUnique({ where: { id: outletId, storeId }, select: { isMain: true } });

export const countOutletDependenciesModel = (storeId, outletId) =>
    prisma.outlet.findUnique({
        where: { id: outletId, storeId },
        select: {
            _count: {
                 select: {
                    batches: true,        // stock batches (onDelete: Restrict)
                    movements: true,      // stock history at this outlet (Restrict)
                    otherMovements: true, // transfers that point at this outlet (Restrict)
                    orders: true,         // orders placed at this outlet (Restrict)
                    orderItems: true,     // order lines fulfilled from this outlet (Restrict)
                },
            },
        },
    });


// ONE round trip: read the target and the current main, move the flag, read the result.
// Both updates carry the same condition ("the target is active and not already main"), so if the
// target can't become main (missing, inactive, already main), neither update changes anything.
// A concurrent change makes the second update hit the unique index (P2002).
export const setMainOutletModel = async (storeId, outletId) => {
    // The condition, written once: "the store has this outlet, and it is active and not main"
    const targetQualifies = {
        store: { outlets: { some: { id: outletId, isActive: true, isMain: false } } },
    };

    const [target, oldMain, , setResult, after] = await prisma.$transaction([
        prisma.outlet.findUnique({
            where: { id: outletId, storeId },
            select: { id: true, name: true, isMain: true, isActive: true },
        }),
        prisma.outlet.findFirst({ where: { storeId, isMain: true }, select: { id: true, name: true } }),

        // 1. the old main outlet stops being main, only when the target qualifies
        prisma.outlet.updateMany({
            where: { storeId, isMain: true, ...targetQualifies },
            data: { isMain: false },
        }),

        // 2. the target becomes main
        prisma.outlet.updateMany({
            where: { id: outletId, storeId, isActive: true, isMain: false },
            data: { isMain: true },
        }),

        prisma.outlet.findUnique({ where: { id: outletId, storeId }, select: outletSelect }),
    ]);

    return { target, oldMain, changed: setResult.count === 1, outlet: after };
};