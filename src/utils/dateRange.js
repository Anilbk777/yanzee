import { z } from "zod";

// "+" in a query string arrives as a space: "...:00 05:45" -> "...:00+05:45"
const fixPlus = (v) => (typeof v === "string" ? v.trim().replace(/ (\d{2}:\d{2})$/, "+$1") : v);

const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

// Accepts: 2026-10-13 (whole day, Nepal time), 2026-10-13T09:30:00 (Nepal time),
// 2026-10-13T09:30:00+05:45, 2026-10-13T03:45:00Z
export const instant = (edge) =>
    z.preprocess(
        fixPlus,
        z
            .union(
                [z.iso.datetime({ offset: true }), z.iso.datetime({ local: true }), z.iso.date()],
                "Use a date (YYYY-MM-DD) or a timestamp like 2026-10-13T09:30:00+05:45"
            )
            .transform((v) => {
                if (v.length === 10) {
                    return new Date(`${v}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+05:45`);
                }
                return new Date(HAS_OFFSET.test(v) ? v : `${v}+05:45`);
            })
    );