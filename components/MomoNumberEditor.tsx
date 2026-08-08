"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { momoNumberSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

export function MomoNumberEditor({
  groupId,
  currentNumber,
}: {
  groupId: string;
  currentNumber: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  async function handleSave() {
    setError(null);
    const result = momoNumberSchema.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_group_momo_number", {
      p_group_id: groupId,
      p_momo_number: result.data,
    });
    setSaving(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("MoMo number saved");
    router.refresh();
  }

  return (
    <div className="mt-4 flex items-end gap-2">
      <Field
        label="Group MoMo number"
        placeholder="+250788123456"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        className="flex-1"
      />
      <Button
        variant="secondary"
        onClick={handleSave}
        disabled={saving}
        className="mb-[1px]"
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
