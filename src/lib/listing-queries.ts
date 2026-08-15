import { ProvisioningStatus, Role, type Prisma } from "@prisma/client"

type RawParamValue = string | string[] | undefined

export type ListingSearchParams = Record<string, RawParamValue>

export const paginationLimits = {
  videos: { defaultSize: 12, maxSize: 24 },
  streams: { defaultSize: 12, maxSize: 24 },
  users: { defaultSize: 25, maxSize: 50 },
  modules: { defaultSize: 100, maxSize: 200 },
  jobs: { defaultSize: 25, maxSize: 100 },
  auditEvents: { defaultSize: 25, maxSize: 100 },
} as const

export type PaginationScope = keyof typeof paginationLimits

export type DateCursor = {
  createdAt: Date
  id: string
}

export type PageSlice<T> = {
  items: T[]
  nextCursor: string | null
}

export const moduleOptionSelect = {
  id: true,
  name: true,
  yearGroup: true,
} satisfies Prisma.ModuleSelect

export type ModuleOption = Prisma.ModuleGetPayload<{ select: typeof moduleOptionSelect }>

export const cohortOptionSelect = {
  id: true,
  name: true,
  yearGroup: true,
} satisfies Prisma.CohortSelect

export type CohortOption = Prisma.CohortGetPayload<{ select: typeof cohortOptionSelect }>

export const videoCardSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  isPublic: true,
  audience: true,
  thumbnailUrl: true,
  createdAt: true,
  uploader: {
    select: {
      name: true,
    },
  },
  module: {
    select: moduleOptionSelect,
  },
} satisfies Prisma.VideoSelect

export type VideoCardData = Prisma.VideoGetPayload<{ select: typeof videoCardSelect }>

export const liveStreamCardSelect = {
  id: true,
  streamKey: true,
  title: true,
  description: true,
  isPublic: true,
  audience: true,
  status: true,
  startedAt: true,
  createdAt: true,
  host: {
    select: {
      name: true,
    },
  },
  module: {
    select: moduleOptionSelect,
  },
} satisfies Prisma.LiveStreamSelect

export type LiveStreamCardData = Prisma.LiveStreamGetPayload<{ select: typeof liveStreamCardSelect }>

export const adminUserRowSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  yearGroup: true,
  provisioningStatus: true,
  isActive: true,
  createdAt: true,
  cohortMemberships: {
    select: { cohortId: true },
  },
  moduleEnrollments: {
    select: { moduleId: true },
  },
  teacherAssignments: {
    select: { moduleId: true },
  },
} satisfies Prisma.UserSelect

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserRowSelect }>

function firstParam(value: RawParamValue) {
  return Array.isArray(value) ? value[0] : value
}

export function normalizeQueryParam(value: RawParamValue, maxLength = 80) {
  const normalized = firstParam(value)?.trim().replace(/\s+/g, " ") ?? ""
  return normalized.slice(0, maxLength)
}

export function parseBoundedPageSize(scope: PaginationScope, value: RawParamValue) {
  const limits = paginationLimits[scope]
  const parsed = Number(firstParam(value))

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return limits.defaultSize
  }

  return Math.min(parsed, limits.maxSize)
}

export function parseListingParams(searchParams: ListingSearchParams | undefined, scope: PaginationScope) {
  const cursor = decodeDateCursor(firstParam(searchParams?.cursor))

  return {
    query: normalizeQueryParam(searchParams?.q),
    cursor,
    pageSize: parseBoundedPageSize(scope, searchParams?.limit),
  }
}

export function enumParam<T extends string>(value: RawParamValue, allowed: readonly T[]) {
  const candidate = firstParam(value)
  return allowed.find((item) => item === candidate)
}

export function roleParam(value: RawParamValue) {
  return enumParam(value, Object.values(Role))
}

export function provisioningStatusParam(value: RawParamValue) {
  return enumParam(value, Object.values(ProvisioningStatus))
}

export function encodeDateCursor(item: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id }), "utf8").toString("base64url")
}

export function decodeDateCursor(value: string | undefined) {
  if (!value || value.length > 256) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<{
      createdAt: string
      id: string
    }>
    const createdAt = new Date(String(parsed.createdAt ?? ""))

    if (!parsed.id || parsed.id.length > 128 || Number.isNaN(createdAt.getTime())) {
      return null
    }

    return { createdAt, id: parsed.id }
  } catch {
    return null
  }
}

export function dateCursorWhere<T>(cursor: DateCursor | null): T | undefined {
  if (!cursor) {
    return undefined
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  } as T
}

export function andWhere<T>(clauses: Array<T | null | undefined>): T {
  const activeClauses = clauses.filter((clause): clause is T => Boolean(clause))

  if (activeClauses.length === 0) {
    return {} as T
  }

  if (activeClauses.length === 1) {
    return activeClauses[0]
  }

  return { AND: activeClauses } as T
}

export function paginateDateCursorItems<T extends { createdAt: Date; id: string }>(
  rows: T[],
  pageSize: number,
): PageSlice<T> {
  const items = rows.slice(0, pageSize)
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor: rows.length > pageSize && lastItem ? encodeDateCursor(lastItem) : null,
  }
}

export function listingHref(pathname: string, params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      searchParams.set(key, String(value))
    }
  }

  const queryString = searchParams.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
}

export function videoSearchWhere(query: string): Prisma.VideoWhereInput | undefined {
  if (!query) {
    return undefined
  }

  return {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { uploader: { is: { name: { contains: query, mode: "insensitive" } } } },
      { module: { is: { name: { contains: query, mode: "insensitive" } } } },
      { module: { is: { yearGroup: { contains: query, mode: "insensitive" } } } },
    ],
  }
}

export function liveStreamSearchWhere(query: string): Prisma.LiveStreamWhereInput | undefined {
  if (!query) {
    return undefined
  }

  return {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { host: { is: { name: { contains: query, mode: "insensitive" } } } },
      { module: { is: { name: { contains: query, mode: "insensitive" } } } },
      { module: { is: { yearGroup: { contains: query, mode: "insensitive" } } } },
    ],
  }
}

export function userSearchWhere(query: string): Prisma.UserWhereInput | undefined {
  if (!query) {
    return undefined
  }

  return {
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { yearGroup: { contains: query, mode: "insensitive" } },
    ],
  }
}
