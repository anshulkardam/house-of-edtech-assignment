import prisma from "@/lib/prisma";
import {
  authMiddleware,
  requireAdmin,
  requireStudent,
} from "@/server/middleware/auth.middleware";
import {
  askAiQuestionSchema,
  getChapterSchema,
  getMessagesSchema,
  updateChapterSchema,
} from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AIService } from "../ai/service";
import {
  successResponse,
  errorResponse,
  ErrorCodes,
  paginatedResponse,
} from "@/server/utils/response";

const chapter = new Hono()
  // Get chapter by ID
  .get(
    "/:id",
    zValidator(
      "param",
      getChapterSchema
        .pick({ chapterId: true })
        .transform((d) => ({ chapterId: d.chapterId }))
    ),
    async (c) => {
      const { chapterId } = c.req.valid("param");

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              published: true,
            },
          },
        },
      });

      if (!chapter) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Chapter not found", 404);
      }

      return successResponse(c, chapter);
    }
  )

  // Update chapter (Admin only)
  .patch(
    "/:id",
    authMiddleware,
    requireAdmin,
    zValidator(
      "param",
      getChapterSchema
        .pick({ chapterId: true })
        .transform((d) => ({ chapterId: d.chapterId }))
    ),
    zValidator("json", updateChapterSchema),
    async (c) => {
      const { chapterId } = c.req.valid("param");
      const data = c.req.valid("json");
      const user = c.get("user");

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          course: {
            select: { createdByAdminId: true },
          },
        },
      });

      if (!chapter) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Chapter not found", 404);
      }

      if (chapter.course.createdByAdminId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You can only update chapters in your own courses",
          403
        );
      }

      const updatedChapter = await prisma.chapter.update({
        where: { id: chapterId },
        data,
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      return successResponse(c, updatedChapter);
    }
  )

  // Delete chapter (Admin only)
  .delete(
    "/:id",
    authMiddleware,
    requireAdmin,
    zValidator(
      "param",
      getChapterSchema
        .pick({ chapterId: true })
        .transform((d) => ({ chapterId: d.chapterId }))
    ),
    async (c) => {
      const { chapterId } = c.req.valid("param");
      const user = c.get("user");

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          course: {
            select: { createdByAdminId: true },
          },
        },
      });

      if (!chapter) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Chapter not found", 404);
      }

      if (chapter.course.createdByAdminId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You can only delete chapters in your own courses",
          403
        );
      }

      await prisma.chapter.delete({
        where: { id: chapterId },
      });

      return successResponse(c, { message: "Chapter deleted successfully" });
    }
  )

  // Ask AI a question
  .post(
    "/ask",
    authMiddleware,
    requireStudent,
    zValidator("json", askAiQuestionSchema),
    async (c) => {
      const { chapterId, question } = c.req.valid("json");
      const user = c.get("user");

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          course: {
            select: {
              published: true,
            },
          },
        },
      });

      if (!chapter || !chapter.course.published) {
        return errorResponse(
          c,
          ErrorCodes.NOT_FOUND,
          "Chapter not found or course not published",
          404
        );
      }

      const isEnrolled = await prisma.courseProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.id,
            courseId: chapter.courseId,
          },
        },
      });

      if (!isEnrolled) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You must be enrolled in this course to ask questions",
          403
        );
      }

      let conversation = await prisma.conversation.findUnique({
        where: { chapterId_studentId: { chapterId, studentId: user.id } },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { chapterId, studentId: user.id },
        });
      }

      await prisma.message.create({
        data: {
          sender: "Student",
          content: question,
          conversationId: conversation.id,
        },
      });

      const ai = new AIService(); //TODO: should be a getInstance instead
      const answer = await ai.question({
        model: user.aiModel,
        conversationId: conversation.id,
        chapterId,
        question,
        userId: user.id,
      });

      return successResponse(c, answer);
    }
  )

  // Get messages for a chapter
  .get(
    "/:id/messages",
    authMiddleware,
    requireStudent,
    zValidator(
      "param",
      getChapterSchema
        .pick({ chapterId: true })
        .transform((d) => ({ chapterId: d.chapterId }))
    ),
    zValidator("query", getMessagesSchema.omit({ chapterId: true })),
    async (c) => {
      const user = c.get("user");
      const { chapterId } = c.req.valid("param");
      const { page, limit } = c.req.valid("query");

      const conversation = await prisma.conversation.findUnique({
        where: { chapterId_studentId: { chapterId, studentId: user.id } },
      });

      if (!conversation) {
        return paginatedResponse(c, [], 0, page, limit);
      }

      const skip = (page - 1) * limit;

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" },
          skip,
          take: limit,
          select: {
            id: true,
            content: true,
            sender: true,
            model: true,
            createdAt: true,
          },
        }),
        prisma.message.count({
          where: { conversationId: conversation.id },
        }),
      ]);

      return paginatedResponse(c, messages, total, page, limit);
    }
  );

export default chapter;
