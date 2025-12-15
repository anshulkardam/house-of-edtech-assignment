import { createMiddleware } from "hono/factory";
import prisma from "@/lib/prisma";
import { getSignedCookie } from "hono/cookie";
import { AUTH_COOKIE, SESSION_TTL_SECONDS } from "../utils/constants";
import { Admin, User } from "@/generated/prisma/client";

export type AuthUser = User & {
  admin: Admin | null;
};

export const authMiddleware = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  const sessionId = await getSignedCookie(
    c,
    AUTH_COOKIE,
    process.env.AUTH_COOKIE_SECRET!
  );

  if (!sessionId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { admin: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return c.json({ error: "Unauthorized" }, 401);
  }

  // sliding expiration
  const now = Date.now();
  const expiresAt = session.expiresAt.getTime();

  if (expiresAt - now < 1000 * 60 * 60 * 24) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000),
      },
    });
  }

  c.set("user", session.user);
  await next();
});

export const requireAdmin = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  const user = c.get("user");
  if (!user?.admin) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
