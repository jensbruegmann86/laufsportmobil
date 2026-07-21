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

        if (pledgeId) {
          const { error: updatePledgeError } = await supabaseAdmin
            .from("pledges")
            .update({ status: "paid", payment_method_choice: "stripe" })
            .eq("id", pledgeId);

          if (updatePledgeError) {
            throw updatePledgeError;
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

        if (pledgeId) {
          const { error: updatePledgeError } = await supabaseAdmin
            .from("pledges")
            .update({ status: "notified", payment_method_choice: "stripe" })
            .eq("id", pledgeId);

          if (updatePledgeError) {
            throw updatePledgeError;
          }
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
