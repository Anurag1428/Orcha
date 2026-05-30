export type StartupLead = {
  startup: string;
  funding?: string | null;
  sector?: string | null;
  rank?: number | null;
  source?: "post" | "infographic" | "merged";
};

export type OutreachState = StartupLead & {
  founder?: string | null;
  linkedin?: string | null;
  domain?: string | null;
  email?: string | null;
  verified?: boolean | null;
  status:
    | "identified"
    | "founder_found"
    | "email_found"
    | "email_verified"
    | "email_rejected"
    | "drafted"
    | "sent"
    | "skipped";
  searchCount: number;
  notes?: string | null;
};

const EMPTY_VALUES = new Set(["", "n/a", "na", "none", "null", "unknown", "-"]);

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonCandidate(text: string) {
  const clean = stripCodeFence(text);
  if (clean.startsWith("[") || clean.startsWith("{")) return clean;

  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return clean.slice(arrayStart, arrayEnd + 1);
  }

  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return clean.slice(objectStart, objectEnd + 1);
  }

  return clean;
}

function parseModelJson(text: string): unknown {
  const candidate = extractJsonCandidate(text);
  return JSON.parse(candidate);
}

function normalizeNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (EMPTY_VALUES.has(normalized.toLowerCase())) return null;
  return normalized;
}

function normalizeStartupName(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function startupKey(startup: string) {
  return startup.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStartupField(item: Record<string, unknown>) {
  return (
    item.startup ??
    item.startupName ??
    item.company ??
    item.companyName ??
    item.name ??
    item.brand
  );
}

export function parseStartupExtraction(
  text: string,
  source: StartupLead["source"],
) {
  const parsed = parseModelJson(text);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { startups?: unknown[] })?.startups)
      ? (parsed as { startups: unknown[] }).startups
      : [parsed];

  return rows
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    )
    .map((row): StartupLead | null => {
      const startup = normalizeStartupName(readStartupField(row));
      if (!startup) return null;

      return {
        startup,
        funding: normalizeNullable(
          row.funding ?? row.fundingAmount ?? row.amount,
        ),
        sector: normalizeNullable(row.sector ?? row.industry ?? row.category),
        rank: toNumber(row.rank ?? row.position),
        source,
      } satisfies StartupLead;
    })
    .filter((row): row is StartupLead => Boolean(row));
}

export function safeParseStartupExtraction(
  text: string,
  source: StartupLead["source"],
) {
  try {
    return parseStartupExtraction(text, source);
  } catch (error) {
    console.warn("[Funding Extraction] Failed to parse model JSON", error);
    return [];
  }
}

export function safeParseJsonObject<T extends Record<string, unknown>>(
  text: string,
): Partial<T> {
  try {
    const parsed = parseModelJson(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<T>)
      : {};
  } catch (error) {
    console.warn(
      "[Funding Extraction] Failed to parse model JSON object",
      error,
    );
    return {};
  }
}

export function mergeStartupLeads(...leadGroups: StartupLead[][]) {
  const merged = new Map<string, StartupLead>();

  for (const lead of leadGroups.flat()) {
    const key = startupKey(lead.startup);
    if (!key) continue;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...lead, source: "merged" });
      continue;
    }

    merged.set(key, {
      startup: existing.startup || lead.startup,
      funding: existing.funding ?? lead.funding ?? null,
      sector: existing.sector ?? lead.sector ?? null,
      rank: existing.rank ?? lead.rank ?? null,
      source: "merged",
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return a.startup.localeCompare(b.startup);
  });
}

export function createOutreachState(initialLeads: StartupLead[] = []) {
  const state = new Map<string, OutreachState>();

  const upsert = (lead: StartupLead & Partial<OutreachState>) => {
    const key = startupKey(lead.startup);
    const existing = state.get(key);
    const next: OutreachState = {
      startup: lead.startup,
      funding: lead.funding ?? existing?.funding ?? null,
      sector: lead.sector ?? existing?.sector ?? null,
      rank: lead.rank ?? existing?.rank ?? null,
      source: "merged",
      founder: lead.founder ?? existing?.founder ?? null,
      linkedin: lead.linkedin ?? existing?.linkedin ?? null,
      domain: lead.domain ?? existing?.domain ?? null,
      email: lead.email ?? existing?.email ?? null,
      verified: lead.verified ?? existing?.verified ?? null,
      status: lead.status ?? existing?.status ?? "identified",
      searchCount: existing?.searchCount ?? 0,
      notes: lead.notes ?? existing?.notes ?? null,
    };

    state.set(key, next);
    return next;
  };

  for (const lead of initialLeads) upsert(lead);

  return {
    list: () => Array.from(state.values()),
    get: (startup: string) => state.get(startupKey(startup)) ?? null,
    upsert,
    incrementSearch: (startup: string) => {
      const key = startupKey(startup);
      const existing = state.get(key);
      if (!existing) return null;
      const next = { ...existing, searchCount: existing.searchCount + 1 };
      state.set(key, next);
      return next;
    },
  };
}

export function splitPersonName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}
