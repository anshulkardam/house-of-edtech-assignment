import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import authRoute from "./routes/auth/route";
import { rateLimiter } from "hono-rate-limiter";

export const app = new Hono().basePath("/api/v1");

app.use(secureHeaders());

app.use("*", logger());

app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each client to 100 requests per window
    keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "", // Use IP address as key
  })
);

app.get("/health", (c) => {
  return c.json({ status: "OK" }, 200);
});

const routes = app.route("/auth", authRoute);

export type AppType = typeof routes;
