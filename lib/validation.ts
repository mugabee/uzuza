import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

// East African mobile numbers, E.164 format (required by Supabase phone
// auth regardless of SMS transport either way): Rwanda (+250, MTN/Airtel
// prefixes 7/1) and Uganda (+256, mobile numbers all start with 7 after
// the country code) — the app's two primary markets per CLAUDE.md.
//
// Deliberately kept narrow and unchanged: this schema backs every
// MoMo-specific form (wallet top-up/withdraw, contribution/pledge
// payment) where the number must actually be one MTN's Collections/
// Disbursements sandbox can reach — widening it here would let someone
// submit a number the payment backend can never process. The broader,
// any-country schema for identity/login use is internationalPhoneSchema
// below, kept as a separate schema on purpose.
const eastAfricaPhoneRegex = /^\+(250[17]\d{8}|256[7]\d{8})$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(
    eastAfricaPhoneRegex,
    "Enter a valid Rwanda (+250...) or Uganda (+256...) phone number, e.g. +250788123456",
  );

// Any-country E.164 phone number, for identity purposes (login/signup,
// profile) where the number is used for OTP delivery, not a MoMo
// payment — validated via libphonenumber-js's real per-country
// metadata rather than a hand-rolled regex, since "any country" can't
// reasonably be hardcoded.
export const internationalPhoneSchema = z
  .string()
  .trim()
  .refine((value) => isValidPhoneNumber(value), {
    message: "Enter a valid phone number, including the country code",
  });

export const emailSchema = z.string().trim().email("Enter a valid email address");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const loginSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("phone"), identifier: phoneSchema }),
  z.object({ method: z.literal("email"), identifier: emailSchema }),
]);
export type LoginInput = z.infer<typeof loginSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  phone: internationalPhoneSchema,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const groupTypeSchema = z.enum(["rotating", "event"]);

export const createGroupSchema = z.object({
  name: z.string().trim().min(3, "Group name is too short").max(80),
  groupType: groupTypeSchema,
  contributionAmount: z.coerce.number().positive("Enter an amount greater than 0"),
  frequency: z.enum(["weekly", "monthly"]),
  targetSize: z.coerce.number().int().min(2, "A group needs at least 2 members").max(50),
  accountType: z.enum(["group_owned", "uzuza_held"]),
  rotationMethod: z.enum(["random", "fixed"]),
  approvalThreshold: z.enum(["1", "2-of-3", "all"]),
  pledgeGoal: z.coerce
    .number()
    .positive("Enter an amount greater than 0")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CreateGroupFormInput = z.input<typeof createGroupSchema>;
export type CreateGroupInput = z.output<typeof createGroupSchema>;

export const momoNumberSchema = phoneSchema;

// Shared by both the member-side contribution proof form and the
// admin-side payout completion form — same "transaction ID + screenshot"
// proof-of-transfer requirement either direction, per CLAUDE.md Section 4.
export const transferProofSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(4, "Enter the MoMo transaction ID / confirmation text")
    .max(100),
  screenshot: z
    // FileList is a browser-only global — z.custom defers the reference to
    // validation time instead of module-eval time, so this file can still
    // be imported from server components/pages.
    .custom<FileList>(
      (val) => typeof FileList !== "undefined" && val instanceof FileList,
      { message: "Attach a screenshot of the payment" },
    )
    .refine((list) => list.length === 1, "Attach a screenshot of the payment")
    .transform((list) => list[0])
    .refine((f) => f.size <= 5 * 1024 * 1024, "Screenshot must be under 5MB")
    .refine(
      (f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type),
      "Screenshot must be a PNG, JPEG, or WEBP image",
    ),
});
export type TransferProofFormInput = z.input<typeof transferProofSchema>;
export type TransferProofInput = z.output<typeof transferProofSchema>;

export const payoutProofSchema = transferProofSchema;
export type PayoutProofFormInput = TransferProofFormInput;
export type PayoutProofInput = TransferProofInput;

// Extends the base proof-of-payment shape with how/from-where a sender
// paid. `card_gateway` is deliberately excluded — schema-ready on the
// backend (payment_channel enum), but no real gateway exists yet, so the
// UI never lets anyone select it.
export const paymentChannelSchema = z.enum([
  "momo_manual",
  "international_manual",
  "momo_remittance",
]);
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;

export const internationalProofSchema = transferProofSchema.extend({
  paymentChannel: paymentChannelSchema,
  payerCurrency: z.string().trim().length(3, "Pick a currency"),
  payerAmount: z.coerce
    .number()
    .positive("Enter the amount you sent")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type InternationalProofFormInput = z.input<typeof internationalProofSchema>;
export type InternationalProofInput = z.output<typeof internationalProofSchema>;

export const contributionProofSchema = internationalProofSchema;
export type ContributionProofFormInput = InternationalProofFormInput;
export type ContributionProofInput = InternationalProofInput;

export const pledgeProofSchema = internationalProofSchema;
export type PledgeProofFormInput = InternationalProofFormInput;
export type PledgeProofInput = InternationalProofInput;

export const reservationProofSchema = internationalProofSchema;
export type ReservationProofFormInput = InternationalProofFormInput;
export type ReservationProofInput = InternationalProofInput;

export const rejectContributionSchema = z.object({
  reason: z.string().trim().min(3, "Say why this is being rejected").max(300),
});
export type RejectContributionInput = z.infer<typeof rejectContributionSchema>;

export const proposeSettingsChangeSchema = z.object({
  name: z.string().trim().max(80).optional(),
  contributionAmount: z.coerce.number().positive().optional(),
  targetSize: z.coerce.number().int().min(2).optional(),
  approvalThreshold: z.enum(["1", "2-of-3", "all"]).optional(),
  momoNumber: phoneSchema.optional().or(z.literal("")),
});
export type ProposeSettingsChangeInput = z.infer<typeof proposeSettingsChangeSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Say a bit more").max(300),
});
export type ReasonInput = z.infer<typeof reasonSchema>;

export const missedPaymentSchema = z.object({
  fineAmount: z.coerce.number().min(0, "Enter 0 or more"),
});
export type MissedPaymentInput = z.infer<typeof missedPaymentSchema>;

export const createPledgeSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  visibility: z.enum(["public", "name_only", "private"]),
});
export type CreatePledgeInput = z.infer<typeof createPledgeSchema>;
