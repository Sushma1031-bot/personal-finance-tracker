import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for JWT signing");
}

// Extend Express Request to carry userId after auth
declare global {
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}

/**
 * JWT Bearer auth middleware.
 * Reads the Authorization header, verifies the token, and attaches userId to req.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Sign a JWT token for the given user ID (expires in 7 days). */
export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET!, { expiresIn: "7d" });
}
