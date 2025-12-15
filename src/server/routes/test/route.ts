import prisma from "@/lib/prisma";
import { authMiddleware, requireStudent } from "@/server/middleware/auth.middleware";
import {
  createTestSchema,
  getTestLeaderboardSchema,
  getTestSchema,
  paginationSchema,
  submitTestSchema,
} from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  ErrorCodes,
} from "@/server/utils/response";
import { AIService } from "../ai/service";

const TEST_QUESTIONS_COUNT = 10;

const tests = new Hono()
  // Get all tests (with pagination)
  .get("/", zValidator("query", paginationSchema), async (c) => {
    const { page, limit } = c.req.valid("query");
    const skip = (page - 1) * limit;

    const [testList, total] = await Promise.all([
      prisma.test.findMany({
        where: { submittedAt: { not: null } },
        skip,
        take: limit,
        orderBy: { submittedAt: "desc" },
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
          student: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.test.count({
        where: { submittedAt: { not: null } },
      }),
    ]);

    const formattedTests = testList.map((test) => ({
      id: test.id,
      aiScore: test.aiScore,
      submittedAt: test.submittedAt,
      course: test.course,
      student: {
        id: test.student.user.id,
        name: test.student.user.name,
      },
    }));

    return paginatedResponse(c, formattedTests, total, page, limit);
  })

  // Get my tests
  .get(
    "/my-tests",
    authMiddleware,
    requireStudent,
    zValidator("query", paginationSchema),
    async (c) => {
      const user = c.get("user");
      const { page, limit } = c.req.valid("query");
      const skip = (page - 1) * limit;

      const [testList, total] = await Promise.all([
        prisma.test.findMany({
          where: { studentId: user.id },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            aiScore: true,
            submittedAt: true,
            createdAt: true,
            course: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            _count: {
              select: {
                testQuestions: true,
              },
            },
          },
        }),
        prisma.test.count({
          where: { studentId: user.id },
        }),
      ]);

      return paginatedResponse(c, testList, total, page, limit);
    }
  )

  // Get test leaderboard for a course
  .get(
    "/leaderboard/:courseId",
    zValidator("param", getTestLeaderboardSchema.pick({ courseId: true }).transform(d => ({ courseId: d.courseId }))),
    zValidator("query", paginationSchema),
    async (c) => {
      const { courseId } = c.req.valid("param");
      const { page, limit } = c.req.valid("query");
      const skip = (page - 1) * limit;

      const [leaderboard, total] = await Promise.all([
        prisma.test.findMany({
          where: {
            courseId,
            submittedAt: { not: null },
            aiScore: { not: null },
          },
          skip,
          take: limit,
          orderBy: { aiScore: "desc" },
          select: {
            id: true,
            aiScore: true,
            submittedAt: true,
            student: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
        }),
        prisma.test.count({
          where: {
            courseId,
            submittedAt: { not: null },
            aiScore: { not: null },
          },
        }),
      ]);

      const formattedLeaderboard = leaderboard.map((test, index) => ({
        rank: skip + index + 1,
        testId: test.id,
        score: test.aiScore,
        submittedAt: test.submittedAt,
        student: {
          id: test.student.user.id,
          name: test.student.user.name,
          image: test.student.user.image,
        },
      }));

      return paginatedResponse(c, formattedLeaderboard, total, page, limit);
    }
  )

  // Create/Get test for a course
  .post(
    "/create",
    authMiddleware,
    requireStudent,
    zValidator("json", createTestSchema),
    async (c) => {
      const { courseId } = c.req.valid("json");
      const user = c.get("user");

      // Check if course exists and is published
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

      // Check if user is enrolled
      const isEnrolled = await prisma.courseProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.id,
            courseId,
          },
        },
      });

      if (!isEnrolled) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You must be enrolled in this course to take a test",
          403
        );
      }

      // Check if there's an existing incomplete test
      const existingTest = await prisma.test.findFirst({
        where: {
          courseId,
          studentId: user.id,
          submittedAt: null,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          testQuestions: {
            include: {
              question: {
                include: {
                  answer: true,
                },
              },
            },
          },
        },
      });

      if (existingTest) {
        // Return existing test without answers
        const formattedTest = {
          id: existingTest.id,
          course: existingTest.course,
          questions: existingTest.testQuestions.map((tq) => ({
            id: tq.id,
            questionId: tq.questionId,
            question: tq.question.question,
            studentAnswer: tq.studentAnswer,
          })),
          createdAt: existingTest.createdAt,
        };

        return successResponse(c, formattedTest);
      }

      // Get random questions from course
      const questions = await prisma.question.findMany({
        where: {
          chapter: {
            courseId,
          },
        },
        include: {
          answer: true,
        },
      });

      if (questions.length < TEST_QUESTIONS_COUNT) {
        return errorResponse(
          c,
          ErrorCodes.VALIDATION_ERROR,
          `Course must have at least ${TEST_QUESTIONS_COUNT} questions to create a test`,
          400
        );
      }

      // Randomly select questions
      const shuffled = questions.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, TEST_QUESTIONS_COUNT);

      // Create test
      const test = await prisma.test.create({
        data: {
          studentId: user.id,
          courseId,
          testQuestions: {
            create: selectedQuestions.map((q) => ({
              questionId: q.id,
            })),
          },
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          testQuestions: {
            include: {
              question: true,
            },
          },
        },
      });

      // Format response (don't send answers)
      const formattedTest = {
        id: test.id,
        course: test.course,
        questions: test.testQuestions.map((tq) => ({
          id: tq.id,
          questionId: tq.questionId,
          question: tq.question.question,
          studentAnswer: null,
        })),
        createdAt: test.createdAt,
      };

      return successResponse(c, formattedTest, 201);
    }
  )

  // Submit test
  .post(
    "/submit",
    authMiddleware,
    requireStudent,
    zValidator("json", submitTestSchema),
    async (c) => {
      const { testId, answers } = c.req.valid("json");
      const user = c.get("user");

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          testQuestions: {
            include: {
              question: {
                include: {
                  answer: true,
                },
              },
            },
          },
        },
      });

      if (!test) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Test not found", 404);
      }

      if (test.studentId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "This is not your test",
          403
        );
      }

      if (test.submittedAt) {
        return errorResponse(
          c,
          ErrorCodes.TEST_ALREADY_SUBMITTED,
          "Test already submitted",
          400
        );
      }

      // Update student answers
      await Promise.all(
        answers.map((answer) =>
          prisma.testQuestion.updateMany({
            where: {
              testId,
              questionId: answer.questionId,
            },
            data: {
              studentAnswer: answer.studentAnswer,
            },
          })
        )
      );

      // Prepare data for AI grading
      const gradingData = test.testQuestions.map((tq) => {
        const studentAnswer = answers.find(
          (a) => a.questionId === tq.questionId
        );
        return {
          questionId: tq.questionId,
          question: tq.question.question,
          correctAnswer: tq.question.answer?.answer || "",
          explanation: tq.question.answer?.explanation || null,
          studentAnswer: studentAnswer?.studentAnswer || null,
        };
      });

      // Grade with AI
      const ai = new AIService();
      const results = await ai.submitTest({
        testId,
        answers: gradingData,
        userId: user.id,
        model: user.aiModel,
      });

      // Fetch updated test with scores
      const updatedTest = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          testQuestions: {
            include: {
              question: {
                include: {
                  answer: true,
                },
              },
            },
          },
        },
      });

      const formattedResult = {
        testId: test.id,
        totalScore: results.totalScore,
        maxScore: results.maxScore,
        submittedAt: updatedTest?.submittedAt,
        questions: updatedTest?.testQuestions.map((tq) => ({
          question: tq.question.question,
          correctAnswer: tq.question.answer?.answer,
          explanation: tq.question.answer?.explanation,
          studentAnswer: tq.studentAnswer,
          score: tq.aiScore,
          feedback: tq.aiFeedback,
        })),
      };

      return successResponse(c, formattedResult);
    }
  )

  // Get test details
  .get(
    "/:id",
    authMiddleware,
    zValidator("param", getTestSchema.pick({ testId: true }).transform(d => ({ testId: d.testId }))),
    async (c) => {
      const { testId } = c.req.valid("param");
      const user = c.get("user");

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          testQuestions: {
            include: {
              question: {
                include: {
                  answer: true,
                },
              },
            },
          },
        },
      });

      if (!test) {
        return errorResponse(c, ErrorCodes.NOT_FOUND, "Test not found", 404);
      }

      if (test.studentId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "You can only view your own tests",
          403
        );
      }

      // If test not submitted, don't show answers
      const questions = test.testQuestions.map((tq) => ({
        id: tq.id,
        questionId: tq.questionId,
        question: tq.question.question,
        studentAnswer: tq.studentAnswer,
        ...(test.submittedAt && {
          correctAnswer: tq.question.answer?.answer,
          explanation: tq.question.answer?.explanation,
          score: tq.aiScore,
          feedback: tq.aiFeedback,
        }),
      }));

      return successResponse(c, {
        id: test.id,
        course: test.course,
        aiScore: test.aiScore,
        submittedAt: test.submittedAt,
        createdAt: test.createdAt,
        questions,
      });
    }
  );

export default tests;