"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { PromotionForm, EMPTY_PROMOTION_FORM } from "@/components/promotion-form";
import type { Promotion } from "@/lib/types";

export default function NewPromotionPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">New promotion</h1>
        <p className="text-sm text-ash-400">
          Mirror the official promotion&apos;s terms. Risk limits and strategy are set per-bot afterward.
        </p>
      </div>

      <PromotionForm
        initial={EMPTY_PROMOTION_FORM}
        submitLabel="Create promotion"
        busyLabel="Creating…"
        onSubmit={async (payload) => {
          const promo = (await api.createPromotion(payload)) as Promotion;
          router.push(`/promotions/${promo.id}`);
        }}
      />
    </div>
  );
}
