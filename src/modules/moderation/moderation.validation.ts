import { z } from "zod";
import { ModerationStatus } from "../../generated/prisma/client";

/** The two things that can be submitted. */
export const submissionKindSchema = z.enum(["destination", "place"]);

export const queueQuerySchema = z.object({
  kind: submissionKindSchema.default("destination"),
  status: z.enum(ModerationStatus).default(ModerationStatus.PENDING),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * A rejection has to say why.
 *
 * The note is the only thing the contributor sees, and "rejected" with no
 * reason teaches them nothing and produces the same submission again.
 */
export const rejectSchema = z.object({
  // The message covers the missing case as well as a too-short one: a reviewer
  // who omits the field should be told what to do, not what Zod saw.
  note: z
    .string({ error: "Say why it was turned down, so it can be fixed" })
    .trim()
    .min(3, "Say why it was turned down, so it can be fixed")
    .max(500),
});

export type SubmissionKind = z.infer<typeof submissionKindSchema>;
export type QueueQuery = z.infer<typeof queueQuerySchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
