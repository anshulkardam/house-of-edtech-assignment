import { Hono } from "hono";
import { handle } from "hono/vercel";
import authRoute from "@/routes/auth";

const app = new Hono().basePath("/api/v1");

const routes = app.route("/auth", authRoute);

export const GET = handle(app);
export const POST = handle(app);

export type AppType = typeof routes;
