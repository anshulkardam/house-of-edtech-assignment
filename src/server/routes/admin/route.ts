import prisma from "@/lib/prisma";
import { authMiddleware, requireSuperAdmin } from "@/server/middleware/auth.middleware";
import { approveAdminRequestSchema, paginationSchema, requestAdminSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  ErrorCodes,
} from "@/server/utils/response";
import { UserRole, AdminRequestStatus } from "@/generated/prisma/client";
import z from "zod";

export const listUsersSchema = paginationSchema.extend({
  role: z.enum(UserRole).optional(),
  search: z.string().optional(),
});

const admin = new Hono()
  // Request admin access
  .post("/request", authMiddleware, zValidator("json", requestAdminSchema), async (c) => {
    const user = c.get("user");
    const { reason } = c.req.valid("json");

    if (user.admin) {
      return errorResponse(c, ErrorCodes.ALREADY_EXISTS, "You are already an admin", 400);
    }

    const existingRequest = await prisma.adminRequest.findUnique({
      where: { userId: user.id },
    });

    if (existingRequest) {
      if (existingRequest.status === AdminRequestStatus.PENDING) {
        return errorResponse(
          c,
          ErrorCodes.ALREADY_EXISTS,
          "You already have a pending admin request",
          400
        );
      } else if (existingRequest.status === AdminRequestStatus.APPROVED) {
        return errorResponse(
          c,
          ErrorCodes.ALREADY_EXISTS,
          "Your admin request was already approved",
          400
        );
      }
    }

    const request = await prisma.adminRequest.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        reason,
        status: AdminRequestStatus.PENDING,
      },
      update: {
        reason,
        status: AdminRequestStatus.PENDING,
      },
    });

    return successResponse(c, request, 201);
  })

  // Get my admin request status
  .get("/request/status", authMiddleware, async (c) => {
    const user = c.get("user");

    const request = await prisma.adminRequest.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!request) {
      return successResponse(c, { hasRequest: false, request: null });
    }

    return successResponse(c, { hasRequest: true, request });
  })

  // List all admin requests (Super Admin only)
  .get(
    "/requests",
    authMiddleware,
    requireSuperAdmin,
    zValidator("query", paginationSchema),
    async (c) => {
      const { page, limit } = c.req.valid("query");
      const skip = (page - 1) * limit;

      const [requests, total] = await Promise.all([
        prisma.adminRequest.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        }),
        prisma.adminRequest.count(),
      ]);

      return paginatedResponse(c, requests, total, page, limit);
    }
  )

  // Approve/Reject admin request (Super Admin only)
  .post(
    "/approve",
    authMiddleware,
    requireSuperAdmin,
    zValidator("json", approveAdminRequestSchema),
    async (c) => {
      const { userId, approved } = c.req.valid("json");

      const request = await prisma.adminRequest.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              admin: true,
            },
          },
        },
      });

      if (!request) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Admin request not found", 404);
      }

      if (request.status !== AdminRequestStatus.PENDING) {
        return errorResponse(
          c,
          ErrorCodes.VALIDATION_ERROR,
          "This request has already been processed",
          400
        );
      }

      await prisma.$transaction(async (tx) => {
        // Update request status
        await tx.adminRequest.update({
          where: { userId },
          data: {
            status: approved ? AdminRequestStatus.APPROVED : AdminRequestStatus.REJECTED,
          },
        });

        if (approved) {
          // Update user role
          await tx.user.update({
            where: { id: userId },
            data: { role: UserRole.ADMIN },
          });

          // Create admin record if doesn't exist
          if (!request.user.admin) {
            await tx.admin.create({
              data: { userId },
            });
          }
        }
      });

      return successResponse(c, {
        message: approved ? "Admin request approved" : "Admin request rejected",
        userId,
        approved,
      });
    }
  )

  // List all users (Super Admin only)
  .get(
    "/users",
    authMiddleware,
    requireSuperAdmin,
    zValidator("query", listUsersSchema),
    async (c) => {
      const { page, limit, role, search } = c.req.valid("query");
      const skip = (page - 1) * limit;

      const where = {
        ...(role && { role }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            aiModel: true,
            createdAt: true,
            admin: {
              select: {
                _count: {
                  select: { courses: true },
                },
              },
            },
            student: {
              select: {
                _count: {
                  select: {
                    tests: true,
                    conversations: true,
                  },
                },
              },
            },
            creditBalance: {
              select: {
                balance: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return paginatedResponse(c, users, total, page, limit);
    }
  )

  // Get user details (Super Admin only)
  .get("/users/:userId", authMiddleware, requireSuperAdmin, async (c) => {
    const userId = c.req.param("userId");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        admin: {
          include: {
            courses: {
              select: {
                id: true,
                title: true,
                slug: true,
                published: true,
                createdAt: true,
                _count: {
                  select: {
                    chapters: true,
                    tests: true,
                  },
                },
              },
            },
          },
        },
        student: {
          include: {
            tests: {
              select: {
                id: true,
                aiScore: true,
                submittedAt: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            courseProgress: {
              select: {
                enrolledAt: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
        creditBalance: {
          select: {
            balance: true,
          },
        },
        transactions: {
          select: {
            id: true,
            amount: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!user) {
      return errorResponse(c, ErrorCodes.NOT_FOUND, "User not found", 404);
    }

    const { password: _, ...userWithoutPassword } = user;

    return successResponse(c, userWithoutPassword);
  })

  // Get statistics (Super Admin only)
  .get("/stats", authMiddleware, requireSuperAdmin, async (c) => {
    const [
      totalUsers,
      totalStudents,
      totalAdmins,
      totalCourses,
      publishedCourses,
      totalTests,
      completedTests,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.student.count(),
      prisma.admin.count(),
      prisma.course.count(),
      prisma.course.count({ where: { published: true } }),
      prisma.test.count(),
      prisma.test.count({ where: { submittedAt: { not: null } } }),
    ]);

    return successResponse(c, {
      users: {
        total: totalUsers,
        students: totalStudents,
        admins: totalAdmins,
      },
      courses: {
        total: totalCourses,
        published: publishedCourses,
      },
      tests: {
        total: totalTests,
        completed: completedTests,
      },
    });
  });

export default admin;
