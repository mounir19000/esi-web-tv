import { AuditEventType, type Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

type AuditEventInput = {
  type: AuditEventType
  actorId?: string | null
  subjectId?: string | null
  metadata?: Prisma.InputJsonValue
}

export async function recordAuditEvent(input: AuditEventInput) {
  try {
    await prisma.auditEvent.create({
      data: {
        type: input.type,
        actorId: input.actorId ?? null,
        subjectId: input.subjectId ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    })
  } catch (error) {
    console.error(
      "Audit event write failed",
      error instanceof Error ? error.message : error,
    )
  }
}
