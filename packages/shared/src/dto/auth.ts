import { z } from "zod";

/** Auth Service (user profile) request/response contracts. */

export const AuthClaimsSchema = z.object({
  /** Cognito `sub` — the stable user id across the platform. */
  sub: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});
export type AuthClaims = z.infer<typeof AuthClaimsSchema>;

export const UserProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email().nullable().optional(),
    avatar_url: z.string().nullable().optional(),
  })
  .passthrough();

export const MeResponseSchema = z.object({ user: UserProfileSchema }).passthrough();
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatar_url: z.string().optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const UserDemographicsSchema = z.object({
  minBudget: z.number().nullable().optional(),
  maxBudget: z.number().nullable().optional(),
  travelType: z.string(),
  purpose: z.string(),
  numberOfPeople: z.union([z.string(), z.number()]).optional(),
});
export type UpdateDemographics = z.infer<typeof UserDemographicsSchema>;

export const GetDemographicsResponseSchema = z
  .object({
    userId: z.string(),
    minBudget: z.number().nullable().optional(),
    maxBudget: z.number().nullable().optional(),
    travelType: z.string(),
    purpose: z.string(),
    numberOfPeople: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type GetDemographicsResponse = z.infer<typeof GetDemographicsResponseSchema>;
