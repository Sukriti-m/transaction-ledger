export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(code, message) {
  return new AppError(404, code, message);
}

export function badRequest(code, message, details) {
  return new AppError(400, code, message, details);
}

export function conflict(code, message, details) {
  return new AppError(409, code, message, details);
}

export function unprocessable(code, message, details) {
  return new AppError(422, code, message, details);
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError || (err?.status && err?.code)) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
  }

  console.error("Internal Error:", err);
  return res.status(err?.status || 500).json({
    error: {
      code: err?.code || "INTERNAL_ERROR",
      message: err?.message || "An unexpected error occurred.",
    },
  });
}
