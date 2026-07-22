import { NextResponse } from "next/server";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type CheckoutBody = {
  studentId: string;
  amountCents: number;
  sponsorName: string;
  pledgeId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CheckoutBody>;

    if (!body.studentId || !body.sponsorName) {
      return NextResponse.json(
        { error: "studentId and sponsorName are required." },
        { status: 400 },
      );
    }

    if (!body.amountCents || body.amountCents < 50) {
      return NextResponse.json(
        { error: "amountCents must be at least 50." },
        { status: 400 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const origin = appUrl || request.headers.get("origin") || "http://localhost:3000";
    const stripe = getStripeServerClient();
    const supabase = getSupabaseAdminClient();

    const { data: student } = await supabase
      .from("students")
      .select("id, run_id")
      .eq("id", body.studentId)
      .maybeSingle();

    const { data: run } = student
      ? await supabase
          .from("runs")
          .select("id, title, date")
          .eq("id", student.run_id)
          .maybeSingle()
      : { data: null as { id: string; title: string; date: string } | null };

    const runTitle = run?.title?.slice(0, 120) ?? "Unbekanntes Event";
    const checkoutMetadata = {
      student_id: body.studentId,
      sponsor_name: body.sponsorName,
      pledge_id: body.pledgeId ?? "",
      run_id: run?.id ?? "",
      run_title: runTitle,
      run_date: run?.date ?? "",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: run?.id ?? body.studentId,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            product_data: {
              name: `Sponsorenlauf Spende: ${body.sponsorName}`,
              description: `${runTitle} · Schueler-ID ${body.studentId}`,
            },
            unit_amount: body.amountCents,
          },
        },
      ],
      success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
      metadata: checkoutMetadata,
      payment_intent_data: {
        metadata: checkoutMetadata,
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error("Error creating Stripe Checkout session", error);

    return NextResponse.json(
      { error: "Unable to create checkout session." },
      { status: 500 },
    );
  }
}
