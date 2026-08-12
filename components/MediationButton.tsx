"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { reasonSchema, type ReasonInput } from "@/lib/validation";
import { Button } from "@/components/Button";
import { friendlyError } from "@/lib/friendly-error";

export function MediationButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ReasonInput>({ resolver: zodResolver(reasonSchema) });

  async function onSubmit(values: ReasonInput) {
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("request_mediation", {
      p_group_id: groupId,
      p_reason: values.reason,
    });
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    setDone(true);
  }

  if (done) {
    return <p className="text-xs text-primary">Mediation requested — Uzuza support has been notified.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-foreground/50 underline-offset-2 hover:underline"
      >
        Request mediation
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      <textarea
        {...register("reason")}
        placeholder="What's the dispute about?"
        className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        rows={2}
      />
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
