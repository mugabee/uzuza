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
