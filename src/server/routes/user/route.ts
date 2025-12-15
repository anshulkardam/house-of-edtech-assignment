import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { Hono } from "hono";

const auth = new Hono()
  .get("/me", authMiddleware, async (c) => {
    const user = c.get("user");

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  })
  .get("/credits", authMiddleware, async (c) => {
    const user = c.get("user");
    const credits = await prisma.creditBalance.findUnique({
      where: { userId: user.id },
    });

    return c.json({ credits }, 200);
  })
  .get("/transactions", authMiddleware, async (c) => {
    const user = c.get("user");
    const credits = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return c.json({ credits }, 200);
  });
