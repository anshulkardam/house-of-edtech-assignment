import { createMiddleware } from "hono/factory";
import prisma from "@/lib/prisma";
import { getSignedCookie } from "hono/cookie";
import { AUTH_COOKIE, SESSION_TTL_SECONDS } from "../utils/constants";
import { Admin, Student, User, UserRole } from "@/generated/prisma/client";
import { ErrorCodes, errorResponse } from "../utils/response";

export type AuthUser = User & {
  admin: Admin | null;
  student: Student | null;
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
    include: { user: { include: { admin: true, student: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return errorResponse(c, ErrorCodes.UNAUTHORIZED, "Session expired", 401);
  }

  // sliding expiration
  const now = Date.now();
  const expiresAt = session.expiresAt.getTime();
  const twentyFourHours = 1000 * 60 * 60 * 24;

  if (expiresAt - now < twentyFourHours) {
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

  if (!user?.admin && user.role !== UserRole.SUPER_ADMIN) {
    return errorResponse(c, ErrorCodes.FORBIDDEN, "Admin access required", 403);
  }

  await next();
});

export const requireSuperAdmin = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  const user = c.get("user");
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;

  if (user.email !== superAdminEmail || user.role !== UserRole.SUPER_ADMIN) {
    return errorResponse(
      c,
      ErrorCodes.FORBIDDEN,
      "Super admin access required",
      403
    );
  }

  await next();
});

export const requireStudent = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  const user = c.get("user");

  // Auto-create student record if doesn't exist
  if (!user.student) {
    await prisma.student.create({
      data: { userId: user.id },
    });

    // Refresh user data
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { admin: true, student: true },
    });

    if (updatedUser) {
      c.set("user", updatedUser);
    }
  }

  await next();
});
