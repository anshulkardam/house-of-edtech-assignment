import prisma from "@/lib/prisma";
import {
  authMiddleware,
  requireAdmin,
  requireStudent,
} from "@/server/middleware/auth.middleware";
import {
  createCourseSchema,
  enrollCourseSchema,
  getCourseSchema,
  paginationSchema,
  updateCourseSchema,
} from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  ErrorCodes,
} from "@/server/utils/response";

const course = new Hono()
  // Get all published courses with pagination
  .get("/", zValidator("query", paginationSchema), async (c) => {
    const { page, limit } = c.req.valid("query");
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where: { published: true },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
      }),
      prisma.course.count({
        where: { published: true },
      }),
    ]);

    return paginatedResponse(c, courses, total, page, limit);
  })

  // Get course by ID
  .get("/:id", zValidator("param", getCourseSchema), async (c) => {
    const { courseId } = c.req.valid("param");

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            order: true,
          },
          orderBy: { order: "asc" },
        },
        _count: {
          select: {
            tests: true,
          },
        },
      },
    });

    if (!course) {
      return errorResponse(c, ErrorCodes.NOT_FOUND, "Course not found", 404);
    }

    return successResponse(c, course);
  })

  // Get course by slug
  .get("/slug/:slug", async (c) => {
    const slug = c.req.param("slug");

    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            order: true,
          },
          orderBy: { order: "asc" },
        },
        _count: {
          select: {
            tests: true,
          },
        },
      },
    });

    if (!course) {
      return errorResponse(c, ErrorCodes.NOT_FOUND, "Course not found", 404);
    }

    return successResponse(c, course);
  })

  // Create course (Admin only)
  .post(
    "/",
    authMiddleware,
    requireAdmin,
    zValidator("json", createCourseSchema),
    async (c) => {
      const { chapters, ...courseInput } = c.req.valid("json");
      const user = c.get("user");

      // Check if slug already exists
      const existingCourse = await prisma.course.findUnique({
        where: { slug: courseInput.title.toLowerCase().replace(/\s+/g, "-") },
      });

      if (existingCourse) {
        return errorResponse(
          c,
          ErrorCodes.DUPLICATE_ERROR,
          "Course with this slug already exists",
          409
        );
      }

      const course = await prisma.$transaction(async (tx) => {
        return tx.course.create({
          data: {
            ...courseInput,
            slug: courseInput.title.toLowerCase().replace(/\s+/g, "-"),
            admin: { connect: { userId: user.id } },
            chapters: {
              create: chapters.map((chapter, index) => ({
                title: chapter.title,
                content: chapter.content,
                order: chapter.order ?? index,
                questions: {
                  create: chapter.questions.map((q) => ({
                    question: q.question,
                    answer: {
                      create: {
                        answer: q.answer,
                        explanation: q.explanation,
                      },
                    },
                  })),
                },
              })),
            },
          },
          include: {
            chapters: {
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: "asc" },
            },
          },
        });
      });

      return successResponse(c, course, 201);
    }
  )

  // Update course (Admin only)
  .patch(
    "/:id",
    authMiddleware,
    requireAdmin,
    zValidator(
      "param",
      getCourseSchema
        .pick({ courseId: true })
        .transform((d) => ({ courseId: d.courseId }))
    ),
    zValidator("json", updateCourseSchema),
    async (c) => {
      const { courseId } = c.req.valid("param");
      const data = c.req.valid("json");
      const user = c.get("user");

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { createdByAdminId: true },
      });

      if (!course) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Course not found", 404);
      }

      if (course.createdByAdminId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You can only update your own courses",
          403
        );
      }

      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data,
        include: {
          chapters: {
            select: {
              id: true,
              title: true,
              order: true,
            },
            orderBy: { order: "asc" },
          },
        },
      });

      return successResponse(c, updatedCourse);
    }
  )

  // Delete course (Admin only)
  .delete(
    "/:id",
    authMiddleware,
    requireAdmin,
    zValidator(
      "param",
      getCourseSchema
        .pick({ courseId: true })
        .transform((d) => ({ courseId: d.courseId }))
    ),
    async (c) => {
      const { courseId } = c.req.valid("param");
      const user = c.get("user");

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { createdByAdminId: true },
      });

      if (!course) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Course not found", 404);
      }

      if (course.createdByAdminId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You can only delete your own courses",
          403
        );
      }

      await prisma.course.delete({
        where: { id: courseId },
      });

      return successResponse(c, { message: "Course deleted successfully" });
    }
  )

  // Enroll in course
  .post(
    "/enroll",
    authMiddleware,
    requireStudent,
    zValidator("json", enrollCourseSchema),
    async (c) => {
      const { courseId } = c.req.valid("json");
      const user = c.get("user");

      const course = await prisma.course.findUnique({
        where: { id: courseId, published: true },
      });

      if (!course) {
        return errorResponse(
          c,
          ErrorCodes.NOT_FOUND,
          "Course not found or not published",
          404
        );
      }

      const existingProgress = await prisma.courseProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.id,
            courseId,
          },
        },
      });

      if (existingProgress) {
        return errorResponse(
          c,
          ErrorCodes.ALREADY_ENROLLED,
          "Already enrolled in this course",
          409
        );
      }

      const progress = await prisma.courseProgress.create({
        data: {
          studentId: user.id,
          courseId,
        },
        include: {
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              image: true,
            },
          },
        },
      });

      return successResponse(c, progress, 201);
    }
  )

  // Get my courses as admin
  .get(
    "/admin/my-courses",
    authMiddleware,
    requireAdmin,
    zValidator("query", paginationSchema),
    async (c) => {
      const user = c.get("user");
      const { page, limit } = c.req.valid("query");
      const skip = (page - 1) * limit;

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where: { createdByAdminId: user.id },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: {
                chapters: true,
                tests: true,
              },
            },
          },
        }),
        prisma.course.count({
          where: { createdByAdminId: user.id },
        }),
      ]);

      return paginatedResponse(c, courses, total, page, limit);
    }
  );

export default course;
