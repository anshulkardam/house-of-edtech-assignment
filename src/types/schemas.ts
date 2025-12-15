import { $Enums } from "@/generated/prisma/client";
import z from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email").min(1, "Email is required"),
  password: z.string("Password is required"),
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

export const questionSchema = z.object({
  question: z.string(),
  answer: z.string(),
  explanation: z.string().optional(),
});

export const createChapterSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  questions: z.array(questionSchema),
});

export const createCourseSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1), // TODO: slug should be created by server
  description: z.string().min(1),
  published: z.boolean().default(false),
  image: z.url().optional(),
  chapters: z.array(createChapterSchema).min(1),
});

export const getCourseSchema = z.object({
  courseId: z.string(),
});

export const getChapterSchema = z.object({
  chapterId: z.string(),
});

export const updateAiModelSchema = z.object({
  model: z.enum($Enums.AIModel),
});

export const schemaPayment = z.object({
  creditsCount: z.coerce.number().min(1),
});
