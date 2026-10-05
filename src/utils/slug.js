import crypto from "crypto";

const DIGITS = "0123456789";
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const randomChar = (chars) => chars[crypto.randomInt(chars.length)];

export const slugify = (text, { maxLength = 60, fallback = "item" } = {}) =>
    text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLength)
        .replace(/-+$/g, "") || fallback; // names with no latin characters fall back

// 3 digits + 1 letter, shuffled (e.g. "4k82")
export const randomSuffix = () => {
    const chars = [randomChar(DIGITS), randomChar(DIGITS), randomChar(DIGITS), randomChar(LETTERS)];

    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
};