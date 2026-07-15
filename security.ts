import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const ROOM_CODE_PATTERN = /^\d{6}$/;

export function generateSecureRoomCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function isValidRoomCode(code: unknown): code is string {
  return typeof code === "string" && ROOM_CODE_PATTERN.test(code);
}

export function getAllowedOrigins(): string | string[] {
  const appUrl = process.env.APP_URL?.trim();
  if (
    process.env.NODE_ENV === "production" &&
    appUrl &&
    appUrl !== "MY_APP_URL" &&
    appUrl.startsWith("http")
  ) {
    try {
      const origin = new URL(appUrl).origin;
      return [origin];
    } catch {
      console.warn("Invalid APP_URL; falling back to permissive CORS in production.");
    }
  }
  return "*";
}

export function sanitizeRedirectUrl(
  url: unknown,
  fallbackOrigin: string
): string {
  const fallback = fallbackOrigin || "http://localhost:3000";
  if (typeof url !== "string" || !url.trim()) return fallback;

  try {
    const parsed = new URL(url, fallback);
    const allowedOrigin = new URL(fallback).origin;
    if (parsed.origin !== allowedOrigin) {
      return fallback;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (!adminKey) {
    if (process.env.NODE_ENV !== "production") {
      next();
      return;
    }
    res.status(503).json({
      success: false,
      error: "Admin API is not configured on this server.",
    });
    return;
  }

  const provided = req.header("x-admin-key");
  if (!provided || !timingSafeEqual(provided, adminKey)) {
    res.status(401).json({ success: false, error: "Unauthorized." });
    return;
  }
  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function estimateBase64Bytes(base64: string): number {
  const data = base64.includes("base64,")
    ? base64.split("base64,")[1]
    : base64;
  return Math.ceil((data.length * 3) / 4);
}

export const LIMITS = {
  JSON_BODY: "10mb",
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_PROMPT_CHARS: 4000,
  MAX_TRANSCRIPT_CHARS: 8000,
  MAX_JOB_DESCRIPTION_CHARS: 12000,
  MAX_CV_CHARS: 12000,
  MAX_SCREEN_CONTEXT_CHARS: 8000,
  ROOM_JOIN_ATTEMPTS_PER_IP: 20,
  ROOM_JOIN_WINDOW_MS: 15 * 60 * 1000,
  AI_REQUESTS_PER_MINUTE: 12,
} as const;
