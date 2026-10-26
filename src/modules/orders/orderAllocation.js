import { mulDivRound } from "../../utils/money.js";

const key = (outletId, itemKey) => `${outletId}|${itemKey}`;

// lines: [{ index, itemKey, quantity }]   availability: Map("outletId|itemKey" -> sellable units)
// For each line: the preferred outlet if it covers it, else the outlet with the most stock that
// covers it, else split across outlets (preferred first, then most stock). Short = reported.
export const allocateStock = ({ lines, availability, outletIds, preferredOutletId }) => {
    const avail = new Map(availability);
    const assignments = [];
    const shortages = [];

    for (const line of lines) {
        const have = (o) => avail.get(key(o, line.itemKey)) ?? 0;
        const total = outletIds.reduce((sum, o) => sum + have(o), 0);

        if (total < line.quantity) {
            shortages.push({ index: line.index, requested: line.quantity, available: total });
            continue;
        }

        const preferred = line.preferredOutletId ?? preferredOutletId;

        const ordered = [...outletIds].sort((a, b) => {
            if (a === preferred) return -1;
            if (b === preferred) return 1;
            return have(b) - have(a) || a.localeCompare(b);
        });

        const single = ordered.find((o) => have(o) >= line.quantity);
        const plan = [];
        if (single) {
            plan.push([single, line.quantity]);
        } else {
            let left = line.quantity;
            for (const o of ordered) {
                const take = Math.min(have(o), left);
                if (take > 0) { plan.push([o, take]); left -= take; }
                if (left === 0) break;
            }
        }

        for (const [outletId, quantity] of plan) {
            assignments.push({ index: line.index, outletId, quantity });
            avail.set(key(outletId, line.itemKey), have(outletId) - quantity);
        }
    }
    return { assignments, shortages };
};

// One order line becomes one row per outlet it is fulfilled from. The line discount is shared out
// in proportion to quantity; the last row takes the remainder so the cents always add up.
export const splitLines = (lines, assignments) => {
    const byLine = new Map();
    for (const a of assignments) {
        if (!byLine.has(a.index)) byLine.set(a.index, []);
        byLine.get(a.index).push(a);
    }

    return lines.flatMap((line) => {
        const parts = byLine.get(line.index);
        let left = line.discountCents;

        return parts.map((p, i) => {
            const last = i === parts.length - 1;
            const share = last ? left : Math.min(left, mulDivRound(line.discountCents, p.quantity, line.quantity));
            left -= share;

            return {
                productId: line.productId,
                variantId: line.variantId,
                outletId: p.outletId,
                productName: line.productName,
                variantName: line.variantName,
                sku: line.sku,
                image: line.image,
                unitCents: line.unitCents,
                quantity: p.quantity,
                discountType: line.discount?.type ?? null,
                discountValue: line.discount?.value ?? null,
                discountCents: share,
                lineTotalCents: line.unitCents * p.quantity - share,
            };
        });
    });
};

