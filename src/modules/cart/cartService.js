import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { CartModel } from "./cartModel.js";

const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

export const addToCartService = async (userId, { variantId, quantity }) => {
    logger.info({ userId, variantId, quantity }, "Attempting to add item to cart");

    const variant = await CartModel.findVariantForPurchase(variantId);
    if (!variant) {
        throw new AppError("Product variant not found", constants.NotFound);
    }

    if (variant.product.status !== "ACTIVE") {
        throw new AppError("This product is currently not available for purchase", constants.BadRequest);
    }

    if (variant.product.shop.ownerId === userId) {
        throw new AppError("You cannot add products from your own shop to your cart", constants.BadRequest);
    }

    if (variant.stock < quantity) {
        throw new AppError(
            variant.stock === 0 ? "Product is out of stock" : `Only ${variant.stock} left in stock`,
            constants.BadRequest
        );
    }

    const cart = await CartModel.findOrCreateCart(userId);

    // Check if item already exists in cart to check total combined quantity
    const existingItem = await CartModel.findItemByVariant(cart.id, variantId);
    const newQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    if (newQuantity > variant.stock) {
        throw new AppError(
            `Cannot add ${quantity} more. You already have ${existingItem.quantity} in cart and only ${variant.stock} available.`,
            constants.BadRequest
        );
    }

    const cartItem = await CartModel.upsertItem(cart.id, variantId, newQuantity);
    logger.info({ cartId: cart.id, itemId: cartItem.id }, "Item added to cart successfully");

    return {
        statusCode: constants.Created || 201,
        message: "Item added to cart successfully",
        data: cartItem,
    };
};

export const getCartService = async (userId) => {
    logger.info({ userId }, "Fetching user cart");
    const cart = await CartModel.findOrCreateCart(userId);
    const rawItems = await CartModel.findItems(cart.id);

    const shopsMap = new Map();
    let totalItems = 0;
    let selectedCount = 0;
    let grandTotal = 0;

    for (const item of rawItems) {
        const product = item.variant.product;
        const shop = product.shop;
        const shopId = product.shopId;

        const unitPrice = product.price ? Number(product.price) : 0;
        const discountPrice = product.discountPrice ? Number(product.discountPrice) : null;
        const effectivePrice = discountPrice !== null && discountPrice > 0 ? discountPrice : unitPrice;
        const lineTotal = round2(effectivePrice * item.quantity);

        let warning = null;
        if (product.status !== "ACTIVE") {
            warning = "PRODUCT_INACTIVE";
        } else if (item.variant.stock === 0) {
            warning = "OUT_OF_STOCK";
        } else if (item.quantity > item.variant.stock) {
            warning = `ONLY_${item.variant.stock}_LEFT`;
        } else if (item.variant.stock <= 3) {
            warning = `ONLY_${item.variant.stock}_LEFT`;
        }

        totalItems += item.quantity;
        if (item.isSelected) {
            selectedCount += item.quantity;
            if (!warning || warning.startsWith("ONLY_")) {
                grandTotal += lineTotal;
            }
        }

        const formattedItem = {
            itemId: item.id,
            variantId: item.variantId,
            productId: product.id,
            productName: product.name,
            image: product.image,
            size: item.variant.size,
            quantity: item.quantity,
            unitPrice: unitPrice.toFixed(2),
            discountPrice: discountPrice !== null ? discountPrice.toFixed(2) : null,
            effectivePrice: effectivePrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            stock: item.variant.stock,
            isSelected: item.isSelected,
            warning,
        };

        if (!shopsMap.has(shopId)) {
            shopsMap.set(shopId, {
                shopId,
                shopName: shop ? shop.name : "Unknown Shop",
                items: [],
                shopSubtotal: 0,
            });
        }

        const shopGroup = shopsMap.get(shopId);
        shopGroup.items.push(formattedItem);
        if (item.isSelected && (!warning || warning.startsWith("ONLY_"))) {
            shopGroup.shopSubtotal = round2(shopGroup.shopSubtotal + lineTotal);
        }
    }

    const shops = Array.from(shopsMap.values()).map((shop) => ({
        ...shop,
        shopSubtotal: shop.shopSubtotal.toFixed(2),
    }));

    return {
        statusCode: constants.Success || 200,
        message: "Cart fetched successfully",
        data: {
            shops,
            selectedCount,
            totalItems,
            grandTotal: round2(grandTotal).toFixed(2),
        },
    };
};

export const updateCartItemService = async (userId, itemId, { quantity, isSelected }) => {
    logger.info({ userId, itemId, quantity, isSelected }, "Updating cart item");

    const item = await CartModel.findItemForUser(userId, itemId);
    if (!item) {
        throw new AppError("Cart item not found", constants.NotFound);
    }

    if (quantity !== undefined) {
        if (quantity > item.variant.stock) {
            throw new AppError(`Only ${item.variant.stock} left in stock`, constants.BadRequest);
        }
    }

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (isSelected !== undefined) updateData.isSelected = isSelected;

    const updated = await CartModel.updateItem(itemId, updateData);

    return {
        statusCode: constants.Success || 200,
        message: "Cart item updated successfully",
        data: updated,
    };
};

export const removeCartItemService = async (userId, itemId) => {
    logger.info({ userId, itemId }, "Removing cart item");

    const result = await CartModel.deleteItemForUser(userId, itemId);
    if (result.count === 0) {
        throw new AppError("Cart item not found", constants.NotFound);
    }

    return {
        statusCode: constants.Success || 200,
        message: "Item removed from cart successfully",
    };
};

export const selectAllService = async (userId, isSelected) => {
    logger.info({ userId, isSelected }, "Updating all cart items selection");

    const cart = await CartModel.findOrCreateCart(userId);
    await CartModel.setAllSelected(cart.id, isSelected);

    return {
        statusCode: constants.Success || 200,
        message: `All items ${isSelected ? "selected" : "unselected"} successfully`,
    };
};

export const selectShopService = async (userId, shopId, isSelected) => {
    logger.info({ userId, shopId, isSelected }, "Updating shop cart items selection");

    const cart = await CartModel.findOrCreateCart(userId);
    await CartModel.setShopSelected(cart.id, shopId, isSelected);

    return {
        statusCode: constants.Success || 200,
        message: `Shop items ${isSelected ? "selected" : "unselected"} successfully`,
    };
};

export const clearCartService = async (userId) => {
    logger.info({ userId }, "Clearing user cart");

    const cart = await CartModel.findOrCreateCart(userId);
    await CartModel.deleteAll(cart.id);

    return {
        statusCode: constants.Success || 200,
        message: "Cart cleared successfully",
    };
};

export const getCartCountService = async (userId) => {
    const cart = await CartModel.findOrCreateCart(userId);
    const rawItems = await CartModel.findItems(cart.id);

    let totalCount = 0;
    let selectedCount = 0;

    for (const item of rawItems) {
        totalCount += item.quantity;
        if (item.isSelected) {
            selectedCount += item.quantity;
        }
    }

    return {
        statusCode: constants.Success || 200,
        message: "Cart count fetched successfully",
        data: {
            totalCount,
            selectedCount,
            distinctItems: rawItems.length,
        },
    };
};
