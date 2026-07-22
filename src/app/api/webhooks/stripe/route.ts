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

async function resolveStripePaymentDetails(stripe: Stripe, session: Stripe.Checkout.Session) {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  if (!paymentIntentId) {
    return {
      paymentIntentId: null,
      paymentMethodType: session.payment_method_types?.[0] ?? null,
      cardBrand: null,
      cardLast4: null,
    };
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  const latestCharge = paymentIntent.latest_charge;
  const charge =
    latestCharge && typeof latestCharge !== "string"
      ? (latestCharge as Stripe.Charge)
      : null;
  const paymentMethodDetails = charge?.payment_method_details;

  return {
    paymentIntentId,
    paymentMethodType: paymentMethodDetails?.type ?? session.payment_method_types?.[0] ?? null,
    cardBrand: paymentMethodDetails?.card?.brand ?? null,
    cardLast4: paymentMethodDetails?.card?.last4 ?? null,
  };
}

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

        const paymentDetails = await resolveStripePaymentDetails(stripe, session);

        const { error: linkError } = await supabase
          .from("sponsor_payment_links")
          .update({
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentDetails.paymentIntentId,
            stripe_payment_method_type: paymentDetails.paymentMethodType,
            stripe_card_brand: paymentDetails.cardBrand,
            stripe_card_last4: paymentDetails.cardLast4,
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
