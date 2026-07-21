import { NextResponse } from "next/server";
import { z } from "zod";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const CheckoutSchema = z.object({
  token: z.uuid(),
});

async function parseToken(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as unknown;
    const parsed = z.object({ token: z.string() }).safeParse(body);
    return parsed.success ? parsed.data.token : null;
  }

  const formData = await request.formData();
  const value = formData.get("token");
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request) {
  try {
    const rawToken = await parseToken(request);
    const parsed = CheckoutSchema.safeParse({ token: rawToken });

    if (!parsed.success) {
      return NextResponse.json({ error: "Ungueltiger Zahlungslink." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: paymentLink, error: paymentLinkError } = await supabase
      .from("sponsor_payment_links")
      .select("token, pledge_id, amount_cents, currency, expires_at, paid_at")
      .eq("token", parsed.data.token)
      .maybeSingle();

    if (paymentLinkError || !paymentLink) {
      return NextResponse.json({ error: "Zahlungslink nicht gefunden." }, { status: 404 });
    }

    if (paymentLink.paid_at) {
      return NextResponse.json({ error: "Spende wurde bereits bezahlt." }, { status: 409 });
    }

    if (new Date(paymentLink.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Zahlungslink ist abgelaufen." }, { status: 410 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    const stripe = getStripeServerClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: paymentLink.currency,
            unit_amount: paymentLink.amount_cents,
            product_data: {
              name: "Sponsorenlauf Spende",
              description: `Pledge ${paymentLink.pledge_id}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/pay/${paymentLink.token}?payment=success`,
      cancel_url: `${appUrl}/pay/${paymentLink.token}?payment=cancelled`,
      metadata: {
        pledge_id: paymentLink.pledge_id,
        payment_link_token: paymentLink.token,
      },
    });

    const acceptsJson = request.headers.get("accept")?.includes("application/json");

    if (acceptsJson) {
      return NextResponse.json({ checkoutUrl: session.url }, { status: 200 });
    }

    if (!session.url) {
      return NextResponse.json({ error: "Stripe session has no redirect URL." }, { status: 500 });
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    console.error("Failed to create checkout session", error);
    return NextResponse.json({ error: "Checkout konnte nicht gestartet werden." }, { status: 500 });
  }
}
