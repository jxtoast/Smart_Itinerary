import { z } from "zod";

/** Tools Service contracts: PDF export, groups and itinerary sharing. */

export const GroupCreateSchema = z.object({ name: z.string().min(1) });
export type GroupCreate = z.infer<typeof GroupCreateSchema>;

export const GroupDtoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    ownerUserId: z.string(),
    members: z
      .array(
        z
          .object({
            email: z.string(),
            status: z.enum(["invited", "joined"]),
            userId: z.string().nullable().optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough();
export type GroupDto = z.infer<typeof GroupDtoSchema>;

export const MemberInviteSchema = z.object({
  email: z.string().email(),
});
export type MemberInvite = z.infer<typeof MemberInviteSchema>;

export const JoinGroupSchema = z.object({ inviteToken: z.string().min(1) });
export type JoinGroup = z.infer<typeof JoinGroupSchema>;

export const ShareCreateSchema = z
  .object({
    itineraryId: z.string(),
    groupId: z.string().optional(),
    /** Direct email recipients (peers) when no group is supplied. */
    recipientEmails: z.array(z.string().email()).optional(),
  })
  .refine((v) => Boolean(v.groupId || v.recipientEmails?.length), {
    message: "Provide a groupId or at least one recipientEmail",
  });
export type ShareCreate = z.infer<typeof ShareCreateSchema>;

export const ShareResponseSchema = z.object({
  shareToken: z.string(),
  shareUrl: z.string(),
});
export type ShareResponse = z.infer<typeof ShareResponseSchema>;

export const ExportPdfResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: z.string().optional(),
  storageKey: z.string(),
});
export type ExportPdfResponse = z.infer<typeof ExportPdfResponseSchema>;

/** Read-only itinerary payload served to holders of a share token. */
export const SharedItineraryResponseSchema = z
  .object({
    itineraryId: z.string(),
    sharedAt: z.string().optional(),
    itinerary: z.unknown(),
  })
  .passthrough();
export type SharedItineraryResponse = z.infer<typeof SharedItineraryResponseSchema>;
