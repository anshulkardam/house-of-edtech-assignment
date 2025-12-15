import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@/types/schemas";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/server/utils/helper";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { AUTH_COOKIE, SESSION_TTL_SECONDS } from "@/server/utils/constants";
import { addSeconds } from "date-fns";
import {
  ErrorCodes,
  errorResponse,
  successResponse,
} from "@/server/utils/response";
import { UserRole } from "@/generated/prisma/enums";

const auth = new Hono()
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        admin: true,
        student: true,
      },
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      return errorResponse(
        c,
        ErrorCodes.UNAUTHORIZED,
        "Invalid credentials",
        401
      );
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
        maxAge: SESSION_TTL_SECONDS,
        sameSite: "Strict",
      }
    );

    const { password: _, ...userWithoutPassword } = user;

    return successResponse(
      c,
      {
        user: userWithoutPassword,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      },
      200
    );
  })
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const { email, name, password } = c.req.valid("json");

    const userExists = await prisma.user.findUnique({ where: { email } });

    if (userExists) {
      return errorResponse(
        c,
        ErrorCodes.DUPLICATE_ERROR,
        "Email is already registered",
        409
      );
    }

    const hashed = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        role: UserRole.STUDENT,
      },
      include: {
        admin: true,
        student: true,
      },
    });

    await prisma.student.create({
      data: { userId: user.id },
    });

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
        maxAge: SESSION_TTL_SECONDS,
        sameSite: "Strict",
      }
    );

    const { password: _, ...userWithoutPassword } = user;

    return successResponse(
      c,
      {
        user: userWithoutPassword,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      },
      201
    );
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

    return successResponse(c, { message: "Logged out successfully" }, 200);
  });

export default auth;
