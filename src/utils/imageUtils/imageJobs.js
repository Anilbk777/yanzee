import logger from "../logger.js";
import { enqueueMoves, enqueueDeletes, logQueueFailure } from "../../jobs/queue/imageQueue.js";
import { moveImage, destroyImages } from "./cloudinaryOps.js";

// Fire and forget. If Redis is down, do the work in this process so files still get moved.
export const dispatchMoves = (moves) => {
    if (moves.length === 0) return;

    enqueueMoves(moves).catch((err) => {
        logQueueFailure(err, "move");
        Promise.all(moves.map(moveImage)).catch((e) => logger.error({ err: e }, "Inline move failed"));
    });
};

// ids may contain nulls (a field that had no image), so they are filtered here
export const dispatchDeletes = (ids) => {
    const list = ids.filter(Boolean);
    if (list.length === 0) return;

    enqueueDeletes(list).catch((err) => {
        logQueueFailure(err, "delete");
        destroyImages(list.flatMap((id) => [id, `temp/${id}`])).catch((e) =>
            logger.error({ err: e }, "Inline delete failed")
        );
    });
};