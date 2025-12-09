import { Hono } from "hono";
import { handle } from "hono/vercel";

const app = new Hono().basePath("/api/v1");

app.get("/health", (c) => {
  return c.json({
    status: "ok",
  });
});

export const GET = handle(app);
export const POST = handle(app);
