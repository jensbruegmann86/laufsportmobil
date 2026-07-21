import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const acceptedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Invalid webhook configuration." }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripeServerClient();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!acceptedEvents.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  const supabase = getSupabaseAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pledgeId = session.metadata?.pledge_id;
        const paymentLinkToken = session.metadata?.payment_link_token;

        if (!pledgeId || !paymentLinkToken) {
          throw new Error("Missing pledge_id or payment_link_token metadata.");
        }

        const { error: pledgeError } = await supabase
          .from("pledges")
          .update({ status: "paid", payment_method_choice: "stripe" })
          .eq("id", pledgeId);

        if (pledgeError) {
          throw new Error(`Failed to update pledge status: ${pledgeError.message}`);
        }

        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        const { error: linkError } = await supabase
          .from("sponsor_payment_links")
          .update({
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId ?? null,
          })
          .eq("token", paymentLinkToken);

        if (linkError) {
          throw new Error(`Failed to update sponsor payment link: ${linkError.message}`);
        }

        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pledgeId = session.metadata?.pledge_id;

        if (!pledgeId) {
          break;
        }

        await supabase
          .from("pledges")
          .update({ status: "notified", payment_method_choice: "stripe" })
          .eq("id", pledgeId)
          .neq("status", "paid");

        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
