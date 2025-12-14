import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@/types/schemas";
import prisma from "@/lib/prisma";

const app = new Hono()
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return c.json(
        { status: "error", error: "user not found. please register" },
        401
      );
    }

    if (user.password !== password) {
      return c.json({ status: "error", error: "invalid credentials" }, 401);
    }

    return c.json({ success: "true", data: user });
  })
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const { email, name, password, confirmPassword } = c.req.valid("json");

    const userExists = await prisma.user.findUnique({ where: { email } });

    if (userExists) {
      return c.json(
        { status: "error", error: "email is already registered" },
        409
      );
    }

    const user = await prisma.user.create({ data: { email, name, password } });

    if (!user) {
      return c.json({ status: "error", error: "failed to create user" }, 500);
    }

    return c.json({ success: "true", data: user });
  })
  .post("/logout", (c) => {
    return c.json({ msg: "logout" });
  });

export default app;
