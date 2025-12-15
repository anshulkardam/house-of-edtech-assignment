import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import authRoute from "./routes/auth/route";
import courseRoute from "./routes/courses/route";
import chapterRoute from "./routes/chapter/route";
import adminRoute from "./routes/admin/route";
import userRoute from "./routes/user/route";
import testRoute from "./routes/test/route";
import paymentRoute from "./routes/payment/route";
import aiRoute from "./routes/ai/route";

export const app = new Hono().basePath("/api/v1");

app.use(secureHeaders());

app.use(
  "*",
  cors({
    origin: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use("*", logger());

app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each client to 100 requests per window
    keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "", // Use IP address as key
  })
);

app.get("/health", (c) => {
  return c.json(
    {
      status: "OK",
      timestamp: new Date().toISOString(),
    },
    200
  );
});

const routes = app
  .route("/auth", authRoute)
  .route("/user", userRoute)
  .route("/courses", courseRoute)
  .route("/chapters", chapterRoute)
  .route("/tests", testRoute)
  .route("/ai", aiRoute)
  .route("/payment", paymentRoute)
  .route("/admin", adminRoute);

// Global error handler
app.onError((err, c) => {
  console.error("Global error:", err);

  return c.json(
    {
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : err.message,
      },
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      status: "error",
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    },
    404
  );
});

export type AppType = typeof routes;
