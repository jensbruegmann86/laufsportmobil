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
    return NextResponse.json({ error: "Invalid webhook setup." }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripeServerClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook verification failed", error);
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();

  const { error: insertEventError } = await supabaseAdmin.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    payload: JSON.parse(JSON.stringify(event)),
    processing_status: "received",
  });

  if (insertEventError) {
    if (insertEventError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    console.error("Failed to persist Stripe webhook event", insertEventError);
    return NextResponse.json({ error: "Persistence Error" }, { status: 500 });
  }

  try {
    if (!acceptedEvents.has(event.type)) {
      await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
        .eq("event_id", event.id);

      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pledgeId = session.metadata?.pledge_id;
        const paymentLinkToken = session.metadata?.payment_link_token;

        if (pledgeId) {
          const { error: updatePledgeError } = await supabaseAdmin
            .from("pledges")
            .update({ status: "paid", payment_method_choice: "stripe" })
            .eq("id", pledgeId);

          if (updatePledgeError) {
            throw updatePledgeError;
          }
        }

        if (paymentLinkToken) {
          const paymentDetails = await resolveStripePaymentDetails(stripe, session);

          const { error: linkUpdateError } = await supabaseAdmin
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

          if (linkUpdateError) {
            throw linkUpdateError;
          }
        }

        console.info("Stripe payment succeeded", {
          sessionId: session.id,
          studentId: session.metadata?.student_id,
          sponsorName: session.metadata?.sponsor_name,
          pledgeId,
        });
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pledgeId = session.metadata?.pledge_id;
        const paymentLinkToken = session.metadata?.payment_link_token;

        if (pledgeId) {
          const { error: updatePledgeError } = await supabaseAdmin
            .from("pledges")
            .update({ status: "notified", payment_method_choice: "stripe" })
            .eq("id", pledgeId);

          if (updatePledgeError) {
            throw updatePledgeError;
          }
        }

        if (paymentLinkToken) {
          await supabaseAdmin
            .from("sponsor_payment_links")
            .update({ paid_at: null })
            .eq("token", paymentLinkToken);
        }

        console.warn("Stripe payment failed", {
          sessionId: session.id,
          studentId: session.metadata?.student_id,
          sponsorName: session.metadata?.sponsor_name,
          pledgeId,
        });
        break;
      }
      default:
        break;
    }

    await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("event_id", event.id);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ processing_status: "failed", processed_at: new Date().toISOString() })
      .eq("event_id", event.id);

    return NextResponse.json({ error: "Processing Error" }, { status: 500 });
  }
}
