import { AIModel, UserRole } from "@/generated/prisma/client";
import z from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// Course Schemas
export const questionSchema = z.object({
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
  explanation: z.string().optional(),
});

export const createChapterSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  order: z.number().int().min(0).default(0),
  questions: z
    .array(questionSchema)
    .min(1, "At least one question is required"),
});

export const updateChapterSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});

export const createCourseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  published: z.boolean().default(false),
  image: z.url().optional(),
  chapters: z
    .array(createChapterSchema)
    .min(1, "At least one chapter is required"),
});

export const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  published: z.boolean().optional(),
  image: z.url().optional().nullable(),
});

export const getCourseSchema = z.object({
  courseId: z.cuid(),
});

export const getCourseBySlugSchema = z.object({
  slug: z.string().min(1),
});

// Chapter Schemas
export const getChapterSchema = z.object({
  chapterId: z.cuid(),
});

export const askAiQuestionSchema = z.object({
  chapterId: z.cuid(),
  question: z.string().min(1, "Question is required"),
});

export const getMessagesSchema = z
  .object({
    chapterId: z.cuid(),
  })
  .extend(paginationSchema.shape);


// Test Schemas
export const createTestSchema = z.object({
  courseId: z.cuid(),
});

export const submitTestSchema = z.object({
  testId: z.cuid(),
  answers: z
    .array(
      z.object({
        questionId: z.cuid(),
        studentAnswer: z.string().optional().nullable(),
      })
    )
    .min(1, "At least one answer is required"),
});

export const getTestSchema = z.object({
  testId: z.cuid(),
});

export const getTestLeaderboardSchema = z
  .object({
    courseId: z.cuid(),
  })
  .extend(paginationSchema);

export const updateAiModelSchema = z.object({
  model: z.enum(AIModel),
});

export const createPaymentSchema = z.object({
  creditsCount: z.coerce.number().int().min(1).max(1000),
});

// Admin Schemas
export const requestAdminSchema = z.object({
  reason: z.string().min(10, "Please provide a reason (minimum 10 characters)"),
});

export const approveAdminRequestSchema = z.object({
  userId: z.cuid(),
  approved: z.boolean(),
});

export const listUsersSchema = paginationSchema.extend({
  role: z.enum(UserRole).optional(),
  search: z.string().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  image: z.url().optional().nullable(),
});

export const getTransactionsSchema = paginationSchema;

export const enrollCourseSchema = z.object({
  courseId: z.cuid(),
});


export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type AskAiQuestionInput = z.infer<typeof askAiQuestionSchema>;
export type SubmitTestInput = z.infer<typeof submitTestSchema>;
export type UpdateAiModelInput = z.infer<typeof updateAiModelSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RequestAdminInput = z.infer<typeof requestAdminSchema>;
export type ApproveAdminRequestInput = z.infer<
  typeof approveAdminRequestSchema
>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
