export const IMAGE_KINDS = ["categories", "brands", "products", "logos", "store-seo", "product-seo", "brand-seo", "category-seo"];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const toFinalId = (tempId) => tempId.replace(/^temp\//, "");

// No /v123/ segment, so the URL keeps working after a rename
export const urlFromPublicId = (publicId) =>
    `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}.webp`;

// { publicId, isTemp } if the URL is OUR cloud, THIS store and THIS kind. Otherwise null.
export const parseImageUrl = (rawUrl, storeId, kind) => {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.search || url.hash) {
        return null;
    }

    // storeId comes from the DB (verifyStore) and kind from an allowlist, so both are safe in a regex
    const re = new RegExp(
        `^/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?((temp/)?stores/${storeId}/${kind}/${UUID})\\.webp$`,
        "i"
    );
    const match = url.pathname.match(re);

    return match ? { publicId: match[1], isTemp: Boolean(match[2]) } : null;
};

// publicId of one of our URLs (temp or permanent), or null
export const publicIdOf = (url, storeId, kind) =>
    url ? parseImageUrl(url, storeId, kind)?.publicId ?? null : null;