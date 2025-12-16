import prisma from "@/lib/prisma";
import { authMiddleware } from "@/server/middleware/auth.middleware";
import { stripe } from "@/server/utils/stripe";
import { createPaymentSchema } from "@/types/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { successResponse, errorResponse, ErrorCodes } from "@/server/utils/response";

const CREDIT_PRICE_USD = 1; // $1 per credit

const payment = new Hono()
  // Create checkout session
  .post(
    "/checkout",
    authMiddleware,
    zValidator("json", createPaymentSchema),
    async (c) => {
      const user = c.get("user");
      const { creditsCount } = c.req.valid("json");

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: creditsCount,
              price_data: {
                product_data: {
                  name: "AI Learning Credits",
                  description: `${creditsCount} credits for AI-powered learning`,
                },
                currency: "usd",
                unit_amount: CREDIT_PRICE_USD * 100, // Convert to cents
              },
            },
          ],
          mode: "payment",
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/cancel`,
          metadata: {
            userId: user.id,
            creditsCount: creditsCount.toString(),
          },
          customer_email: user.email,
        });

        return successResponse(c, {
          sessionId: session.id,
          url: session.url,
        });
      } catch (error) {
        console.error("Stripe error:", error);
        return errorResponse(
          c,
          ErrorCodes.INTERNAL_ERROR,
          "Failed to create checkout session",
          500
        );
      }
    }
  )

  // Webhook to handle successful payments
  .post("/webhook", async (c) => {
    const signature = c.req.header("stripe-signature");
    const body = await c.req.text();

    if (!signature) {
      return errorResponse(c, ErrorCodes.VALIDATION_ERROR, "No signature", 400);
    }

    try {
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const userId = session.metadata.userId;
        const creditsCount = parseFloat(session.metadata.creditsCount);

        // Add credits to user's balance
        await prisma.$transaction(async (tx) => {
          const creditBalance = await tx.creditBalance.upsert({
            where: { userId },
            create: {
              userId,
              balance: creditsCount,
            },
            update: {
              balance: {
                increment: creditsCount,
              },
            },
          });

          // Create transaction record
          await tx.transaction.create({
            data: {
              userId,
              creditBalanceId: creditBalance.id,
              amount: creditsCount,
              notes: `Payment: ${creditsCount} credits purchased via Stripe`,
            },
          });
        });
      }

      return successResponse(c, { received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      return errorResponse(
        c,
        ErrorCodes.INTERNAL_ERROR,
        "Webhook processing failed",
        500
      );
    }
  })

  // Verify payment session
  .get("/verify/:sessionId", authMiddleware, async (c) => {
    const sessionId = c.req.param("sessionId");
    const user = c.get("user");

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.metadata?.userId !== user.id) {
        return errorResponse(
          c,
          ErrorCodes.FORBIDDEN,
          "This session doesn't belong to you",
          403
        );
      }

      return successResponse(c, {
        status: session.payment_status,
        amountTotal: session.amount_total,
        creditsCount: parseInt(session.metadata.creditsCount || "0"),
      });
    } catch (error) {
      console.error("Session verification error:", error);
      return errorResponse(
        c,
        ErrorCodes.NOT_FOUND,
        "Session not found",
        404
      );
    }
  });

export default payment;