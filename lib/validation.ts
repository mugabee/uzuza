import { z } from "zod";

// Rwanda mobile numbers: +250 followed by 9 digits. E.164 format is what
// Supabase phone auth requires regardless of SMS transport.
const rwandaPhoneRegex = /^\+250[17]\d{8}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(rwandaPhoneRegex, "Enter a valid Rwanda phone number, e.g. +250788123456");

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
  phone: phoneSchema,
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
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

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

export const contributionProofSchema = transferProofSchema;
export type ContributionProofFormInput = TransferProofFormInput;
export type ContributionProofInput = TransferProofInput;

export const payoutProofSchema = transferProofSchema;
export type PayoutProofFormInput = TransferProofFormInput;
export type PayoutProofInput = TransferProofInput;

export const rejectContributionSchema = z.object({
  reason: z.string().trim().min(3, "Say why this is being rejected").max(300),
});
export type RejectContributionInput = z.infer<typeof rejectContributionSchema>;
