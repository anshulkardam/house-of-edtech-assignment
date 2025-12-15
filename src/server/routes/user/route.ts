import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { successResponse, paginatedResponse } from "@/server/utils/response";
import { getTransactionsSchema, updateProfileSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const user = new Hono()
  .get("/me", authMiddleware, async (c) => {
    const user = c.get("user");

    const { password: _, ...userWithoutPassword } = user;

    return successResponse(c, userWithoutPassword);
  })
  .patch(
    "/me",
    authMiddleware,
    zValidator("json", updateProfileSchema),
    async (c) => {
      const user = c.get("user");
      const data = c.req.valid("json");

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data,
        include: {
          admin: true,
          student: true,
        },
      });

      const { password: _, ...userWithoutPassword } = updatedUser;

      return successResponse(c, userWithoutPassword);
    }
  )
  .get("/credits", authMiddleware, async (c) => {
    const user = c.get("user");

    const credits = await prisma.creditBalance.findUnique({
      where: { userId: user.id },
    });

    return successResponse(c, {
      balance: credits?.balance ?? 0,
      userId: user.id,
    });
  })
  .get(
    "/transactions",
    authMiddleware,
    zValidator("query", getTransactionsSchema),
    async (c) => {
      const user = c.get("user");
      const { page, limit } = c.req.valid("query");

      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            amount: true,
            notes: true,
            promptTokens: true,
            completionTokens: true,
            model: true,
            createdAt: true,
          },
        }),
        prisma.transaction.count({
          where: { userId: user.id },
        }),
      ]);

      return paginatedResponse(c, transactions, total, page, limit);
    }
  )
  .get("/courses", authMiddleware, async (c) => {
    const user = c.get("user");

    const enrolledCourses = await prisma.courseProgress.findMany({
      where: { studentId: user.id },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            image: true,
            published: true,
            createdAt: true,
            _count: {
              select: { chapters: true },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    return successResponse(c, {
      courses: enrolledCourses.map((ep) => ({
        ...ep.course,
        enrolledAt: ep.enrolledAt,
      })),
    });
  });

export default user;
