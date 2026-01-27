import { existsSync, readFileSync } from "fs";
import type { SessionEntry, SessionScore, AgeBuckets } from "../types";

const ARCHITECTURE_KEYWORDS = [
  "design",
  "pattern",
  "refactor",
  "architect",
  "migration",
  "decision",
  "tradeoff",
  "trade-off",
  "approach",
  "strategy",
  "restructure",
  "rewrite",
  "overhaul",
  "convention",
  "standard",
];

const LEARNING_KEYWORDS = [
  "learned",
  "gotcha",
  "pitfall",
  "workaround",
  "trick",
  "tip",
  "insight",
  "discovery",
  "eureka",
  "finally",
  "root cause",
  "the issue was",
  "the problem was",
  "turns out",
  "TIL",
];

/** Categorize sessions by age relative to a reference date */
export function bucketByAge(sessions: SessionEntry[], referenceDate?: Date): AgeBuckets {
  const now = referenceDate || new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const buckets: AgeBuckets = { recent: [], moderate: [], old: [] };

  for (const session of sessions) {
    const modified = new Date(session.modified);
    const ageMs = now.getTime() - modified.getTime();

    if (ageMs < sevenDaysMs) {
      buckets.recent.push(session);
    } else if (ageMs < thirtyDaysMs) {
      buckets.moderate.push(session);
    } else {
      buckets.old.push(session);
    }
  }

  return buckets;
}

/** Read JSONL file and return parsed lines */
export function readJsonlLines(filePath: string): unknown[] {
  if (!existsSync(filePath)) return [];

  const lines: unknown[] = [];
  const content = readFileSync(filePath, "utf-8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }

  return lines;
}

/** Extract text content from a JSONL session for scoring */
export function extractSessionText(filePath: string): string {
  if (!existsSync(filePath)) return "";

  const content = readFileSync(filePath, "utf-8");
  const textParts: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      // Look for message content in common fields
      if (obj.type === "human" || obj.type === "assistant") {
        if (typeof obj.message?.content === "string") {
          textParts.push(obj.message.content);
        } else if (Array.isArray(obj.message?.content)) {
          for (const block of obj.message.content) {
            if (typeof block === "string") textParts.push(block);
            else if (block?.text) textParts.push(block.text);
          }
        }
      }
      // Also check summary fields
      if (obj.summary) textParts.push(String(obj.summary));
    } catch {
      // Skip malformed lines
    }
  }

  return textParts.join("\n");
}

/** Score a session for extraction value */
export function scoreSession(entry: SessionEntry, sessionText?: string): SessionScore {
  let score = 0;
  const reasons: string[] = [];

  // Message count scoring
  if (entry.messageCount > 50) {
    score += 3;
    reasons.push(`Long session (${entry.messageCount} messages)`);
  } else if (entry.messageCount > 30) {
    score += 2;
    reasons.push(`Medium-long session (${entry.messageCount} messages)`);
  } else if (entry.messageCount > 15) {
    score += 1;
    reasons.push(`Moderate session (${entry.messageCount} messages)`);
  }

  // Summary-based scoring
  const summaryLower = (entry.summary || "").toLowerCase();
  const promptLower = (entry.firstPrompt || "").toLowerCase();

  for (const keyword of ARCHITECTURE_KEYWORDS) {
    if (summaryLower.includes(keyword) || promptLower.includes(keyword)) {
      score += 2;
      reasons.push(`Architecture keyword: "${keyword}"`);
      break; // Only count once for architecture
    }
  }

  // Plan mode indicator (summary/prompt mentioning plan)
  if (summaryLower.includes("plan") || promptLower.includes("implement") || promptLower.includes("design")) {
    score += 1;
    reasons.push("Planning/design session");
  }

  // Session text analysis (if provided)
  if (sessionText) {
    const textLower = sessionText.toLowerCase();

    // Error-then-resolution pattern
    const hasError = textLower.includes("error") || textLower.includes("failed") || textLower.includes("bug");
    const hasResolution =
      textLower.includes("fixed") || textLower.includes("resolved") || textLower.includes("solution");
    if (hasError && hasResolution) {
      score += 2;
      reasons.push("Error-resolution pattern detected");
    }

    // Learning keywords
    for (const keyword of LEARNING_KEYWORDS) {
      if (textLower.includes(keyword)) {
        score += 1;
        reasons.push(`Learning keyword: "${keyword}"`);
        break;
      }
    }
  }

  return { sessionId: entry.sessionId, entry, score, reasons };
}

/** Extract key exchanges from a session for review */
export function extractKeyExchanges(filePath: string, maxExchanges: number = 10): string[] {
  if (!existsSync(filePath)) return [];

  const exchanges: string[] = [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  let currentHuman = "";
  let currentAssistant = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const obj = JSON.parse(trimmed);

      if (obj.type === "human") {
        // Save previous exchange
        if (currentHuman && currentAssistant) {
          exchanges.push(`**User:** ${truncate(currentHuman, 200)}\n**Assistant:** ${truncate(currentAssistant, 500)}`);
        }
        currentHuman = extractText(obj);
        currentAssistant = "";
      } else if (obj.type === "assistant") {
        currentAssistant = extractText(obj);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Don't forget the last exchange
  if (currentHuman && currentAssistant) {
    exchanges.push(`**User:** ${truncate(currentHuman, 200)}\n**Assistant:** ${truncate(currentAssistant, 500)}`);
  }

  // Return a sample: first, last, and evenly distributed middle exchanges
  if (exchanges.length <= maxExchanges) return exchanges;

  const selected: string[] = [exchanges[0]];
  const step = Math.floor(exchanges.length / (maxExchanges - 1));
  for (let i = step; i < exchanges.length - 1; i += step) {
    if (selected.length >= maxExchanges - 1) break;
    selected.push(exchanges[i]);
  }
  selected.push(exchanges[exchanges.length - 1]);
  return selected;
}

function extractText(obj: Record<string, unknown>): string {
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return "";

  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((block: unknown) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return (block as { text: string }).text;
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen) + "...";
}
