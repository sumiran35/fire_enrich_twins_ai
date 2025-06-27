import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

/**
 * Creates a rate limiter instance.
 * To disable rate limiting entirely, this function now always returns null.
 * @param endpoint - The API endpoint to apply the rate limit to.
 * @returns A Ratelimit instance or null if disabled.
 */
export const getRateLimiter = (endpoint: string): Ratelimit | null => {
  // Returning null completely disables the rate limiter for all environments.
  return null;

  /*
  // Original code that enabled rate limiting in production:
  if (process.env.NODE_ENV !== "production" && !process.env.UPSTASH_REDIS_REST_URL) {
    return null;
  }

  const redis = Redis.fromEnv();

  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(50, "1 d"),
    analytics: true,
    prefix: `ratelimit:${endpoint}`,
  });
  */
};

/**
 * Helper function to get the client's IP address from a NextRequest.
 * @param request - The incoming Next.js request.
 * @returns The IP address string.
 */
export const getIP = (request: NextRequest): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwarded) {
    // The x-forwarded-for header can contain a comma-separated list of IPs.
    // The first one is the original client IP.
    return forwarded.split(/, /)[0];
  }

  if (realIp) {
    return realIp;
  }

  // Fallback for local development or when headers are not present.
  return "127.0.0.1";
};

/**
 * Checks if a given request is rate-limited for a specific endpoint.
 * Since the rate limiter is disabled via getRateLimiter, this function
 * will always return a successful response.
 * @param request - The incoming Next.js request.
 * @param endpoint - The endpoint identifier.
 * @returns An object indicating the request was successful.
 */
export const isRateLimited = async (request: NextRequest, endpoint: string) => {
  // getRateLimiter() will always return null, disabling the limiter.
  const limiter = getRateLimiter(endpoint);

  // Because the limiter is always null, we can remove the logic that
  // would call the .limit() method, which resolves the error.
  if (!limiter) {
    // This block is now always executed.
    return { success: true, limit: Infinity, remaining: Infinity };
  }

  // The following code is now unreachable and has been removed to fix the error.
  // const ip = getIP(request);
  // const result = await limiter.limit(ip);
  // return { success: result.success, limit: result.limit, remaining: result.remaining };

  // A fallback return to satisfy TypeScript, though it will never be reached.
  return { success: true, limit: Infinity, remaining: Infinity };
};
