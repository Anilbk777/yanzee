export const toCents = (v) => Math.round(Number(v) * 100);
export const fromCents = (c) => (c / 100).toFixed(2);

// round(a * b / c) with exact integer math (BigInt), rounding half up
export const mulDivRound = (a, b, c) =>
    Number((BigInt(a) * BigInt(b) * 2n + BigInt(c)) / (BigInt(c) * 2n));

// FIXED = rupees off the whole base. PERCENT = percent of the base. Returns cents.
export const discountToCents = (discount, baseCents) => {
    if (!discount) return 0;
    if (discount.type === "FIXED") return toCents(discount.value);
    return mulDivRound(baseCents, Math.round(discount.value * 100), 10000);
};