import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@/types/schemas";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/server/utils/helper";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { AUTH_COOKIE, SESSION_TTL_SECONDS } from "@/server/utils/constants";
import { addSeconds } from "date-fns";
import { authMiddleware } from "@/server/middleware/auth.middleware";

const auth = new Hono()
  .get("/me", authMiddleware, async (c) => {
    const user = c.get("user");

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  })
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(password, user.password))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: addSeconds(new Date(), SESSION_TTL_SECONDS),
      },
    });

    await setSignedCookie(
      c,
      AUTH_COOKIE,
      session.id,
      process.env.AUTH_COOKIE_SECRET!,
      {
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        //domain: "example.com",
        maxAge: SESSION_TTL_SECONDS,
        sameSite: "Strict",
      }
    );

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

    const hashed = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, name, password: hashed },
    });

    if (!user) {
      return c.json({ status: "error", error: "failed to create user" }, 500);
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: addSeconds(new Date(), SESSION_TTL_SECONDS),
      },
    });

    await setSignedCookie(
      c,
      AUTH_COOKIE,
      session.id,
      process.env.AUTH_COOKIE_SECRET!,
      {
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        //domain: "example.com",
        maxAge: SESSION_TTL_SECONDS,
        sameSite: "Strict",
      }
    );

    return c.json({ success: "true", data: user });
  })
  .post("/logout", async (c) => {
    const sessionId = await getSignedCookie(
      c,
      AUTH_COOKIE,
      process.env.AUTH_COOKIE_SECRET!
    );

    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } });
    }

    deleteCookie(c, AUTH_COOKIE, { path: "/" });

    return c.json({ success: true });
  });

export default auth;
