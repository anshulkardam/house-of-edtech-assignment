import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { updateAiModelSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const ai = new Hono()
  .get("/", authMiddleware, async (c) => {
    const user = c.get("user");

    const currentModel = user.aiModel;

    return c.json({ currentModel }, 200);
  })
  .post(
    "/",
    authMiddleware,
    zValidator("json", updateAiModelSchema),
    async (c) => {
      const user = c.get("user");

      const { model } = c.req.valid("json");

      const newModel = await prisma.user.update({
        where: { id: user.id },
        data: { aiModel: model },
      });
    }
  );

export default ai;
