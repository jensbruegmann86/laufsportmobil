import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeServerClient } from "@/lib/stripe/server";

const acceptedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);

export async function POST(request: Request) {
  try {
    const signature = (await headers()).get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return NextResponse.json({ error: "Invalid webhook setup." }, { status: 400 });
    }

    const payload = await request.text();
    const stripe = getStripeServerClient();

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (!acceptedEvents.has(event.type)) {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.info("Stripe payment succeeded", {
          sessionId: session.id,
          studentId: session.metadata?.student_id,
          sponsorName: session.metadata?.sponsor_name,
        });
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.warn("Stripe payment failed", {
          sessionId: session.id,
          studentId: session.metadata?.student_id,
          sponsorName: session.metadata?.sponsor_name,
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook verification failed", error);
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
  }
}
