const constants = {
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
    Conflict: 409,
    UnprocessableEntity: 422,
    InternalServerError: 500,

    // Shared image limits, so the upload middleware and the request validators
    // can never drift apart (they used to allow 10 per product gallery while
    // multer only accepted 5 files per request).
    IMAGE_LIMITS: {
        maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
        maxImagesPerUpload: 5,
        maxGalleryImages: 5,
        allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    },
}

export default constants