import prisma from "@/lib/prisma";
import {
  authMiddleware,
  requireAdmin,
} from "@/server/middleware/auth.middleware";
import {
  createCourseSchema,
  getChapterSchema,
  getCourseSchema,
} from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const chapter = new Hono().get(
  "/:courseId",
  zValidator("json", getChapterSchema),
  async (c) => {
    const { chapterId } = c.req.valid("json");

    const course = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { title: true, description: true } } },
    });

    return c.json(course);
  }
);

export default chapter;
