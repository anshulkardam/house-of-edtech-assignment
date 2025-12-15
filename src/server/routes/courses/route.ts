import prisma from "@/lib/prisma";
import {
  authMiddleware,
  requireAdmin,
} from "@/server/middleware/auth.middleware";
import { createCourseSchema, getCourseSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const course = new Hono()
  .get("/", async (c) => {
    const courses = await prisma.course.findMany({
      include: {
        chapters: { select: { id: true }, orderBy: { createdAt: "asc" } },
      },
    });

    return c.json({ status: "success", data: courses }, 200);
  })
  .get("/:courseId", zValidator("json", getCourseSchema), async (c) => {
    const { courseId } = c.req.valid("json");

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { chapters: { select: { title: true, id: true } } },
    });

    return c.json(course);
  })
  .post(
    "/",
    zValidator("json", createCourseSchema),
    authMiddleware,
    requireAdmin,
    async (c) => {
      const { chapters, ...courseInput } = c.req.valid("json");

      const user = c.get("user");

      const course = await prisma.$transaction(async (tx) => {
        return tx.course.create({
          data: {
            ...courseInput,
            admin: { connect: { userId: user.id } },
            chapters: {
              create: chapters.map((chapter) => ({
                title: chapter.title,
                content: chapter.content,
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
        });
      });

      return c.json({ success: true, data: { id: course.id } }, 201);
    }
  );

export default course;
