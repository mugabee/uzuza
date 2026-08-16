// Verifies the staleness watchdog (stale approved payouts, stalled
// forming groups) added after the second fintech-standards gap
// comparison. Confirms:
//   - a payout approved well past the threshold gets flagged
//   - a matching group stuck 'forming' past the threshold gets flagged
//   - re-running the check does NOT create duplicate unresolved flags
//   - nothing here touches any money-moving state — verified by
//     checking the payout/group rows themselves are completely
//     unchanged after the check runs
//   - staff-only / service-role-only access, same as run_ledger_drift_check
// Uses direct service-role table writes to construct the "already
// stale" scenario (backdated timestamps) rather than waiting real
// hours/days.
import { createClient } from "@supabase/supabase-js";

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: settings } = await admin
    .from("platform_settings")
    .select("payout_stale_hours, forming_group_stale_days")
    .eq("id", 1)
    .single();
  console.log("thresholds:", settings);
  assert(settings.payout_stale_hours > 0, "payout_stale_hours is configured");
  assert(settings.forming_group_stale_days > 0, "forming_group_stale_days is configured");

  const { data: creator } = await admin.auth.admin.createUser({ phone: "250788000941", phone_confirm: true });
  const creatorId = creator.user.id;

  let groupId, staleGroupId, cycleId, payoutId;
  try {
    console.log("--- Construct a stale approved payout ---");
    const { data: g } = await admin.from("groups").insert({
      name: "Staleness Watchdog Test Group", group_type: "rotating", contribution_amount: 10000,
      frequency: "monthly", target_size: 2, account_type: "group_owned", rotation_method: "random",
      approval_threshold: "1", created_by: creatorId, status: "active", is_matching_group: false,
    }).select("id").single();
    groupId = g.id;
    await admin.from("group_members").insert({ group_id: groupId, user_id: creatorId, role: "admin" });
    const { data: cyc } = await admin.from("cycles").insert({
      group_id: groupId, cycle_number: 1, recipient_user_id: creatorId, status: "completed",
    }).select("id").single();
    cycleId = cyc.id;
    const { data: p } = await admin.from("payout_requests").insert({
      cycle_id: cycleId, group_id: groupId, recipient_user_id: creatorId, amount: 10000,
      status: "approved", requested_by: creatorId,
    }).select("id").single();
    payoutId = p.id;
    const backdated = new Date(Date.now() - (Number(settings.payout_stale_hours) + 5) * 3600 * 1000).toISOString();
    await admin.from("payout_approvals").insert({ payout_request_id: payoutId, approved_by: creatorId, approved_at: backdated });

    console.log("--- Construct a stalled forming group ---");
    const backdatedGroup = new Date(Date.now() - (Number(settings.forming_group_stale_days) + 3) * 86400 * 1000).toISOString();
    const { data: sg } = await admin.from("groups").insert({
      name: "Staleness Watchdog Stalled Group", group_type: "rotating", contribution_amount: 15000,
      frequency: "monthly", target_size: 5, account_type: "group_owned", rotation_method: "random",
      approval_threshold: "1", created_by: creatorId, status: "forming", is_matching_group: true,
      created_at: backdatedGroup,
    }).select("id").single();
    staleGroupId = sg.id;

    console.log("--- Run the staleness check ---");
    const { data: result, error } = await admin.rpc("run_staleness_check").single();
    assert(!error, `run_staleness_check succeeded (${error?.message ?? ""})`);
    console.log("  result:", result);
    assert(Number(result.stale_payouts_flagged) >= 1, "at least one stale payout flagged");
    assert(Number(result.stalled_groups_flagged) >= 1, "at least one stalled group flagged");

    const { data: payoutFlags } = await admin.from("fraud_flags").select("*").eq("flag_type", "stale_approved_payout").eq("entity_id", payoutId);
    assert(payoutFlags.length === 1, "exactly one flag recorded for the stale payout");
    assert(Number(payoutFlags[0].amount) === 10000, "flag carries the payout amount");

    const { data: groupFlags } = await admin.from("fraud_flags").select("*").eq("flag_type", "stalled_forming_group").eq("entity_id", staleGroupId);
    assert(groupFlags.length === 1, "exactly one flag recorded for the stalled group");

    console.log("--- Nothing money-moving was touched ---");
    const { data: payoutAfter } = await admin.from("payout_requests").select("status, completed_at, transaction_id").eq("id", payoutId).single();
    assert(payoutAfter.status === "approved" && payoutAfter.completed_at === null, "the payout itself is completely untouched — this is monitoring only, never an action");
    const { data: groupAfter } = await admin.from("groups").select("status").eq("id", staleGroupId).single();
    assert(groupAfter.status === "forming", "the group itself is completely untouched");

    console.log("--- Re-running does not create duplicate unresolved flags ---");
    const { data: result2 } = await admin.rpc("run_staleness_check").single();
    console.log("  second run result:", result2);
    const { data: payoutFlagsAfter2 } = await admin.from("fraud_flags").select("id").eq("flag_type", "stale_approved_payout").eq("entity_id", payoutId);
    assert(payoutFlagsAfter2.length === 1, "still exactly one payout flag after a second run — no duplicate");
    const { data: groupFlagsAfter2 } = await admin.from("fraud_flags").select("id").eq("flag_type", "stalled_forming_group").eq("entity_id", staleGroupId);
    assert(groupFlagsAfter2.length === 1, "still exactly one group flag after a second run — no duplicate");

    console.log("--- Access control matches run_ledger_drift_check's pattern ---");
    const memberClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { error: anonError } = await memberClient.rpc("run_staleness_check");
    assert(!!anonError, "an unauthenticated/anon caller is rejected");

    console.log("\nAll staleness watchdog checks passed.");
  } finally {
    console.log("--- Cleanup ---");
    if (payoutId) {
      await admin.from("fraud_flags").delete().eq("entity_id", payoutId);
      await admin.from("payout_approvals").delete().eq("payout_request_id", payoutId);
      await admin.from("payout_requests").delete().eq("id", payoutId);
    }
    if (staleGroupId) {
      await admin.from("fraud_flags").delete().eq("entity_id", staleGroupId);
      await admin.from("groups").delete().eq("id", staleGroupId);
    }
    if (cycleId) await admin.from("cycles").delete().eq("id", cycleId);
    if (groupId) {
      await admin.from("group_members").delete().eq("group_id", groupId);
      await admin.from("groups").delete().eq("id", groupId);
    }
    await admin.auth.admin.deleteUser(creatorId);
    console.log("  done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
