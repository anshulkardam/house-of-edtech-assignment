import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { stripe } from "@/server/utils/stripe";
import { schemaPayment, updateAiModelSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const payment = new Hono().post(
  "/",
  authMiddleware,
  zValidator("json", schemaPayment),
  async (c) => {
    const user = c.get("user");
    const userId = user.id;

    const { creditsCount } = c.req.valid("json");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: creditsCount,
          price_data: {
            product_data: {
              name: "Creditss",
            },
            currency: "usd",
            unit_amount: 100,
          },
        },
      ],
      mode: "payment",
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata: {
        userId,
        creditsCount,
      },
    });

    return c.json({ sessionId: session.id }, 200);
  }
);

export default payment;
