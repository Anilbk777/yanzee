import prisma from "../../config/dbConfig.js";

const itemInclude = {
    variant: {
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    image: true,
                    price: true,
                    discountPrice: true,
                    status: true,
                    shopId: true,
                    shop: { select: { id: true, name: true } },
                },
            },
        },
    },
};

// ---- cart ---------------------------------------------------------------
export const findOrCreateCart = (userId, db = prisma) =>
    db.cart.upsert({ where: { userId }, update: {}, create: { userId } });

// ---- reading items ------------------------------------------------------
export const findItems = (cartId, db = prisma) =>
    db.cartItem.findMany({
        where: { cartId },
        orderBy: { createdAt: "desc" },
        include: itemInclude,
    });

export const findSelectedItems = (cartId, db = prisma) =>
    db.cartItem.findMany({
        where: { cartId, isSelected: true },
        include: itemInclude,
    });

// Ownership check built in: only finds the item if it is in THIS user's cart
export const findItemForUser = (userId, itemId, db = prisma) =>
    db.cartItem.findFirst({
        where: { id: itemId, cart: { userId } },
        include: { variant: true },
    });

export const findItemByVariant = (cartId, variantId, db = prisma) =>
    db.cartItem.findUnique({
        where: { cartId_variantId: { cartId, variantId } },
    });

export const findVariantForPurchase = (variantId, db = prisma) =>
    db.productVariant.findUnique({
        where: { id: variantId },
        include: {
            product: { select: { status: true, shop: { select: { ownerId: true } } } },
        },
    });

// ---- writing items ------------------------------------------------------
// Sets an exact quantity (new items start ticked, like Daraz)
export const upsertItem = (cartId, variantId, quantity, db = prisma) =>
    db.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        update: { quantity, isSelected: true },
        create: { cartId, variantId, quantity, isSelected: true },
    });

// Adds to the existing quantity (used to restore items after a failed payment)
export const addQuantity = (cartId, variantId, quantity, db = prisma) =>
    db.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        update: { quantity: { increment: quantity }, isSelected: true },
        create: { cartId, variantId, quantity, isSelected: true },
    });

export const updateItem = (itemId, data, db = prisma) =>
    db.cartItem.update({ where: { id: itemId }, data });

// ---- selection (the Daraz checkboxes) -----------------------------------
export const setAllSelected = (cartId, isSelected, db = prisma) =>
    db.cartItem.updateMany({ where: { cartId }, data: { isSelected } });

export const setShopSelected = (cartId, shopId, isSelected, db = prisma) =>
    db.cartItem.updateMany({
        where: { cartId, variant: { product: { shopId } } },
        data: { isSelected },
    });

// ---- deleting -----------------------------------------------------------
// returns { count } so the service can 404 when nothing matched
export const deleteItemForUser = (userId, itemId, db = prisma) =>
    db.cartItem.deleteMany({ where: { id: itemId, cart: { userId } } });

export const deleteSelected = (cartId, db = prisma) =>
    db.cartItem.deleteMany({ where: { cartId, isSelected: true } });

export const deleteAll = (cartId, db = prisma) =>
    db.cartItem.deleteMany({ where: { cartId } });

export const deleteByVariantIds = (cartId, variantIds, db = prisma) =>
    db.cartItem.deleteMany({ where: { cartId, variantId: { in: variantIds } } });

export const CartModel = {
    findOrCreateCart,
    findItems,
    findSelectedItems,
    findItemForUser,
    findItemByVariant,
    findVariantForPurchase,
    upsertItem,
    addQuantity,
    updateItem,
    setAllSelected,
    setShopSelected,
    deleteItemForUser,
    deleteSelected,
    deleteAll,
    deleteByVariantIds,
};

