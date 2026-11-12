import { z } from "zod";

// Shared across client (react-hook-form's zodResolver) and server (Server
// Actions re-validate independently — SECURITY.md §9: never rely on
// client-side validation alone).

export const emailSchema = z.email("Enter a valid email address").max(255);

// Mirrors supabase/config.toml [auth.email]: minimum_password_length = 8,
// password_requirements = "lower_upper_letters_digits". Kept in sync by
// hand since Supabase Auth's own policy is the enforced source of truth
// (SECURITY.md §4) — this is a client-side UX pre-check, not the actual
// enforcement boundary.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resendConfirmationSchema = z.object({
  email: emailSchema,
});
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
