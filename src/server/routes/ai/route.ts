import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { successResponse } from "@/server/utils/response";
import { AIModel } from "@/generated/prisma/client";
import z from "zod";

export const updateAiModelSchema = z.object({
  model: z.enum(AIModel),
});

const ai = new Hono()
  // Get current AI model
  .get("/model", authMiddleware, async (c) => {
    const user = c.get("user");

    return successResponse(c, {
      model: user.aiModel,
      availableModels: Object.values(AIModel),
    });
  })

  // Update AI model
  .patch("/model", authMiddleware, zValidator("json", updateAiModelSchema), async (c) => {
    const user = c.get("user");
    const { model } = c.req.valid("json");

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { aiModel: model },
      select: {
        id: true,
        aiModel: true,
      },
    });

    return successResponse(c, {
      message: "AI model updated successfully",
      model: updatedUser.aiModel,
    });
  });

export default ai;
