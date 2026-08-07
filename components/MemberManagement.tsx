"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { useLowDataMode } from "@/lib/low-data-mode";

type Profile = { id: string; full_name: string | null; phone: string | null; avatar_url?: string | null } | null;
type Member = { user_id: string; role: string; profile: Profile };

export function MemberManagement({
  groupId,
  members,
  currentUserId,
  isAdmin,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lowData = useLowDataMode();

  async function handlePromote(userId: string) {
    setBusyId(userId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("propose_group_change", {
      p_group_id: groupId,
      p_change_type: "role_change",
      p_payload: { target_user_id: userId, new_role: "admin" },
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from the group? This is permanent and shows on their record.")) {
      return;
    }
    setBusyId(userId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("remove_member", {
      p_group_id: groupId,
      p_user_id: userId,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Members
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              {lowData ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(m.profile?.full_name ?? "M").charAt(0).toUpperCase()}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.profile?.avatar_url || "/default-avatar.svg"}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover"
                />
              )}
              {m.profile?.full_name ?? "Member"}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs capitalize text-foreground/50">{m.role}</span>
              {isAdmin && m.role === "member" && (
                <>
                  <button
                    type="button"
                    onClick={() => handlePromote(m.user_id)}
                    disabled={busyId === m.user_id}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Propose admin
                  </button>
                  {m.user_id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.user_id)}
                      disabled={busyId === m.user_id}
                      className="text-xs text-red-500 underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  );
}
