import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import authRoute from "./routes/auth/route";
import courseRoute from "./routes/courses/route";
import chapterRoute from "./routes/chapter/route";
import aiRoute from "./routes/ai/route";

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

const routes = app
  .route("/auth", authRoute)
  .route("/courses", courseRoute)
  .route("/chapter", chapterRoute)
  .route("/ai", aiRoute);

export type AppType = typeof routes;
