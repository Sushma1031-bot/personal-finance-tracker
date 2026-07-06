import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Centralized Express error middleware.
 * Must have 4 arguments for Express to treat it as an error handler.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as { status?: number }).status ?? 500;

  req.log.error({ err, status }, "Unhandled error");

  if (res.headersSent) return;

  res.status(status).json({ error: status >= 500 ? "Internal server error" : message });
}
