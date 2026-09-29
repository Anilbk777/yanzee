// Global function to format any Zod error
const formatZodError = (error) => {
    return error.issues.map((issue) => {
        const field = issue.path.join('.');
        return { field, message: issue.message };
    });
};

export const validateRequest = (schema) => (req, res, next) => {
  if (!schema) {
    return next();
  }

  const result = schema.safeParse(req.body);

  if (!result.success) {
    const errors = formatZodError(result.error);
  
    const firstErrorMessage = errors.length > 0 ? errors[0].message : 'Validation failed';

    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: firstErrorMessage,
      errors: errors
    });
  }

  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  if (!schema) return next();

  const result = schema.safeParse(req.query);

  if (!result.success) {
    const errors = formatZodError(result.error);
    const firstErrorMessage = errors.length > 0 ? errors[0].message : 'Validation failed';
    
    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: firstErrorMessage,
      errors,
    });
  }

  // Express 5 defines req.query as a non-memoized prototype getter, so
  // Object.assign(req.query, data) mutates a throwaway object and is lost.
  req.validatedQuery = result.data;
  next();
};


export const validateParams = (schema) => (req, res, next) => {
  if (!schema) return next();

  const result = schema.safeParse(req.params);

  if (!result.success) {
    const errors = formatZodError(result.error);
    const firstErrorMessage = errors.length > 0 ? errors[0].message : 'Validation failed';

    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: firstErrorMessage,
      errors,
    });
  }

  Object.assign(req.params, result.data);
  next();
};