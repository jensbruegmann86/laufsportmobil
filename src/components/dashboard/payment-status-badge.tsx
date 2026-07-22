type PaymentStatus = "pending" | "notified" | "paid";
type PaymentMethod = "cash" | "stripe" | null;

type Props = {
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  compact?: boolean;
};

function resolveLabel(status: PaymentStatus, paymentMethod?: PaymentMethod) {
  if (status === "paid" && paymentMethod === "stripe") {
    return "Bezahlt via Stripe";
  }

  if (status === "paid" && paymentMethod === "cash") {
    return "Bar bezahlt";
  }

  if (paymentMethod === "cash") {
    return "Barzahlung ausstehend";
  }

  if (status === "notified") {
    return "Zahlungslink versendet";
  }

  return "Noch nicht berechnet";
}

function resolveClasses(status: PaymentStatus, paymentMethod?: PaymentMethod) {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (paymentMethod === "cash") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status === "notified") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

export function PaymentStatusBadge({ status, paymentMethod = null, compact = false }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${resolveClasses(status, paymentMethod)} ${compact ? "" : "whitespace-nowrap"}`}
    >
      {resolveLabel(status, paymentMethod)}
    </span>
  );
}
