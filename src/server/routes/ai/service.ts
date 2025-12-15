import { AIModel } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

type ChatCompletionMessageParam = {
  content: string;
  role: "system" | "user" | "assistant";
};

export class AIService {
  private readonly openAI: OpenAI;

  constructor() {
    this.openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async question({
    chapterId,
    question,
    userId,
    conversationId,
    model,
  }: {
    chapterId: string;
    question: string;
    userId: string;
    conversationId: string;
    model: AIModel;
  }) {
    const creditBalance = await prisma.creditBalance.findUnique({
      where: { userId },
    });

    if (!creditBalance || creditBalance.balance <= 0) {
      throw new Error("Insufficient credits");
    }

    const messages: ChatCompletionMessageParam[] = [];

    messages.push({
      content:
        "You are a helpful teacher. Answer the student's question clearly and concisely based on the chapter content provided. If the question is irrelevant to the chapter, politely let the student know and guide them back to the topic.",
      role: "system",
    });

    const { chapter, result } = await this.concatenateCourseInfo(chapterId);

    messages.push({
      content: result,
      role: "system",
    });

    // Get conversation history (last 10 messages)
    const allMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    allMessages.forEach((m) =>
      messages.push({
        content: m.content.substring(0, 500), // Limit to 500 chars
        role: m.sender === "AI" ? "assistant" : "user",
      })
    );

    const aiModel = this.getModelString(model);

    const chatCompletion = await this.openAI.chat.completions.create({
      messages,
      model: aiModel,
      max_completion_tokens: 500,
      temperature: 0.7,
    });

    const answer =
      chatCompletion.choices[0]?.message?.content ||
      "I couldn't generate a response.";

    const aiMessage = await prisma.message.create({
      data: {
        sender: "AI",
        content: answer,
        conversationId,
        model,
      },
      select: {
        id: true,
        content: true,
        sender: true,
        model: true,
        createdAt: true,
      },
    });

    const promptTokens = chatCompletion.usage?.prompt_tokens || 0;
    const completionTokens = chatCompletion.usage?.completion_tokens || 0;

    await this.addTransaction({
      completionTokens,
      model,
      promptTokens,
      userId,
      notes: `Question in Chapter "${chapter?.title}" of ${chapter?.course.title}`,
    });

    return aiMessage;
  }

  async concatenateCourseInfo(chapterId: string) {
    const chapter = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
      },
      include: {
        course: {
          select: {
            title: true,
            description: true,
          },
        },
      },
    });

    if (!chapter) {
      throw new Error("Chapter not found");
    }

    let result = `Course: ${chapter.course.title}\nDescription: ${chapter.course.description}\n\n`;
    result += `Chapter: ${chapter.title}\n\nContent:\n${chapter.content}`;

    return { result, chapter };
  }

  async submitTest({
    testId,
    answers,
    userId,
    model,
  }: {
    testId: string;
    answers: {
      questionId: string;
      studentAnswer?: string | null;
      correctAnswer: string;
      question: string;
      explanation?: string | null;
    }[];
    userId: string;
    model: AIModel;
  }) {
    // Check credits
    const creditBalance = await prisma.creditBalance.findUnique({
      where: { userId },
    });

    if (!creditBalance || creditBalance.balance <= 0) {
      throw new Error("Insufficient credits");
    }

    const systemPrompt = `
    You are an expert teacher grading a test. For each question, provide:
    1. A score from 0-10 (10 being perfect)
    2. Brief feedback explaining the score

    Format your response as JSON array:
    [
      {
        "questionId": "string",
        "score": number (0-10),
        "feedback": "string"
      }
    ]`;

    const questionsText = answers
      .map(
        (a, i) =>
          `Question ${i + 1}: ${a.question}\nCorrect Answer: ${
            a.correctAnswer
          }\n${
            a.explanation ? `Explanation: ${a.explanation}\n` : ""
          }Student Answer: ${a.studentAnswer || "No answer provided"}\n`
      )
      .join("\n---\n");

    const aiModel = this.getModelString(model);

    const chatCompletion = await this.openAI.chat.completions.create({
      model: aiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: questionsText },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const results = JSON.parse(responseText);

    const promptTokens = chatCompletion.usage?.prompt_tokens || 0;
    const completionTokens = chatCompletion.usage?.completion_tokens || 0;

    const totalScore = results.reduce(
      (sum: number, r: any) => sum + (r.score || 0),
      0
    );
    const maxScore = answers.length * 10;
    const percentageScore = Math.round((totalScore / maxScore) * 100);

    // Update test questions with scores
    await Promise.all(
      results.map((result: any) =>
        prisma.testQuestion.updateMany({
          where: {
            testId,
            questionId: result.questionId,
          },
          data: {
            aiScore: result.score,
            aiFeedback: result.feedback,
          },
        })
      )
    );

    // Update test with overall score
    await prisma.test.update({
      where: { id: testId },
      data: {
        aiScore: percentageScore,
        submittedAt: new Date(),
      },
    });

    // Add transaction
    await this.addTransaction({
      completionTokens,
      model,
      promptTokens,
      userId,
      notes: `Test grading for test ${testId}`,
    });

    return {
      totalScore: percentageScore,
      maxScore: 100,
      questionResults: results,
    };
  }

  async addTransaction({
    promptTokens,
    completionTokens,
    model,
    userId,
    notes,
  }: {
    promptTokens: number;
    completionTokens: number;
    model: AIModel;
    userId: string;
    notes?: string;
  }) {
    const cost = MODEL_COSTS[model];

    const usage =
      (promptTokens * cost.promptTokenCost) / 1000000 +
      (completionTokens * cost.completionTokenCost) / 1000000;

    await prisma.$transaction(async (tx) => {
      const creditBalance = await tx.creditBalance.upsert({
        where: { userId },
        create: {
          balance: -usage,
          userId,
        },
        update: {
          balance: {
            decrement: usage,
          },
        },
      });

      await tx.transaction.create({
        data: {
          amount: -usage,
          promptTokens,
          completionTokens,
          userId,
          creditBalanceId: creditBalance.id,
          model,
          notes,
        },
      });
    });
  }

  private getModelString(model: AIModel): string {
    switch (model) {
      case AIModel.gpt_4o:
        return "gpt-4o";
      case AIModel.gpt_4o_mini:
        return "gpt-4o-mini";
      default:
        return "gpt-4o-mini";
    }
  }
}

type ModelCosts = {
  promptTokenCost: number; // per 1M tokens
  completionTokenCost: number; // per 1M tokens
};

export const MODEL_COSTS: Record<AIModel, ModelCosts> = {
  [AIModel.gpt_4o]: {
    promptTokenCost: 2.5,
    completionTokenCost: 10.0,
  },
  [AIModel.gpt_4o_mini]: {
    promptTokenCost: 0.15,
    completionTokenCost: 0.6,
  },
};
