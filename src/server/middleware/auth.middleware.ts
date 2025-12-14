import { createMiddleware } from "hono/factory";
import prisma from "@/lib/prisma";
import { getSignedCookie } from "hono/cookie";
import { AUTH_COOKIE } from "../utils/constants";
import { User } from "@/generated/prisma/client";

export const authMiddleware = createMiddleware<{
  Variables: {
    user: User;
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
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // sliding expiration
  await prisma.session.update({
    where: { id: session.id },
    data: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });

  c.set("user", session.user);
  await next();
});

// export function requireAdmin(c: any, next: any) {
//   const user = c.get("user");
//   if (!user?.admin) {
//     return c.json({ error: "Forbidden" }, 403);
//   }
//   return next();
// }

// export function requireStudent(c: any, next: any) {
//   const user = c.get("user");
//   if (!user?.student) {
//     return c.json({ error: "Forbidden" }, 403);
//   }
//   return next();
// }
