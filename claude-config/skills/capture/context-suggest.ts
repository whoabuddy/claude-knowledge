#!/usr/bin/env bun
/**
 * Context-Aware Knowledge Suggestions
 * Analyzes current working directory and suggests relevant knowledge
 *
 * Usage:
 *   bun context-suggest.ts                    # Current directory
 *   bun context-suggest.ts ~/dev/org/repo     # Specific repo
 *   bun context-suggest.ts --json             # Output as JSON
 *
 * Detects project type and surfaces relevant patterns, nuggets, and runbooks.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const KNOWLEDGE_BASE = join(process.env.HOME || "", "dev", "whoabuddy", "claude-knowledge");
const INDEX_PATH = join(KNOWLEDGE_BASE, ".search-index.json");

interface ProjectContext {
  path: string;
  name: string;
  types: string[]; // e.g., ["clarity", "typescript", "hono"]
  keywords: string[]; // From recent git activity
  files: string[]; // Key file types found
}

interface Suggestion {
  path: string;
  title: string;
  tier: "warm" | "cold" | "icebox";
  category: string;
  relevance: "high" | "medium" | "low";
  reason: string;
  matchedKeywords: string[];
}

interface SearchIndexItem {
  path: string;
  tier: "warm" | "cold" | "icebox";
  category: string;
  title: string;
  keywords: string[];
  content: string;
  accessCount: number;
  lastAccessed?: string;
}

interface SearchIndex {
  version: 1;
  updated: string;
  items: SearchIndexItem[];
}

// Project type detection patterns
const PROJECT_PATTERNS: Record<string, { files: string[]; extensions: string[]; keywords: string[] }> = {
  clarity: {
    files: ["Clarinet.toml", "settings/Devnet.toml"],
    extensions: [".clar"],
    keywords: ["clarity", "stacks", "contract", "clarinet"],
  },
  typescript: {
    files: ["tsconfig.json", "package.json"],
    extensions: [".ts", ".tsx"],
    keywords: ["typescript", "node", "npm", "bun"],
  },
  hono: {
    files: ["package.json"],
    extensions: [".ts"],
    keywords: ["hono", "middleware", "route", "api"],
  },
  cloudflare: {
    files: ["wrangler.toml", "wrangler.jsonc"],
    extensions: [".ts"],
    keywords: ["cloudflare", "worker", "wrangler", "kv"],
  },
  python: {
    files: ["pyproject.toml", "requirements.txt", "setup.py"],
    extensions: [".py"],
    keywords: ["python", "pip", "venv"],
  },
};

function detectProjectTypes(projectPath: string): string[] {
  const types: string[] = [];

  for (const [type, patterns] of Object.entries(PROJECT_PATTERNS)) {
    // Check for key files
    for (const file of patterns.files) {
      if (existsSync(join(projectPath, file))) {
        types.push(type);
        break;
      }
    }

    // Check for file extensions if not already matched
    if (!types.includes(type)) {
      const checkDir = (dir: string, depth: number = 0): boolean => {
        if (depth > 2) return false;
        if (!existsSync(dir)) return false;

        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
              if (checkDir(join(dir, entry.name), depth + 1)) return true;
            } else if (entry.isFile()) {
              for (const ext of patterns.extensions) {
                if (entry.name.endsWith(ext)) return true;
              }
            }
          }
        } catch {
          return false;
        }
        return false;
      };

      if (checkDir(projectPath)) {
        types.push(type);
      }
    }
  }

  // Hono detection requires package.json check
  if (types.includes("typescript") && existsSync(join(projectPath, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["hono"]) types.push("hono");
      if (deps["@cloudflare/workers-types"] || deps["wrangler"]) {
        if (!types.includes("cloudflare")) types.push("cloudflare");
      }
    } catch {
      // Ignore parse errors
    }
  }

  return [...new Set(types)];
}

function extractGitKeywords(projectPath: string): string[] {
  try {
    // Get recent commit messages (last 7 days)
    const result = execSync(
      `git -C "${projectPath}" log --oneline --since="7 days ago" --format="%s" 2>/dev/null | head -20`,
      { encoding: "utf-8" }
    );

    const words = result
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Return top keywords
    return Array.from(freq.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  } catch {
    return [];
  }
}

function analyzeContext(projectPath: string): ProjectContext {
  const name = basename(projectPath);
  const types = detectProjectTypes(projectPath);
  const keywords = extractGitKeywords(projectPath);

  // Collect file types found
  const files: string[] = [];
  for (const type of types) {
    const patterns = PROJECT_PATTERNS[type];
    if (patterns) {
      for (const file of patterns.files) {
        if (existsSync(join(projectPath, file))) {
          files.push(file);
        }
      }
    }
  }

  return { path: projectPath, name, types, keywords, files };
}

function loadSearchIndex(): SearchIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function getSuggestions(context: ProjectContext): Suggestion[] {
  const index = loadSearchIndex();
  if (!index) {
    return [];
  }

  const suggestions: Suggestion[] = [];

  // Collect all keywords to match
  const contextKeywords = new Set<string>();

  // Add type keywords
  for (const type of context.types) {
    const patterns = PROJECT_PATTERNS[type];
    if (patterns) {
      for (const keyword of patterns.keywords) {
        contextKeywords.add(keyword);
      }
    }
  }

  // Add git keywords
  for (const keyword of context.keywords) {
    contextKeywords.add(keyword);
  }

  // Score each knowledge item
  for (const item of index.items) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const contextKw of contextKeywords) {
      // Check title
      if (item.title.toLowerCase().includes(contextKw)) {
        score += 10;
        matchedKeywords.push(contextKw);
      }

      // Check keywords
      const keywordMatch = item.keywords.find((k) => k.includes(contextKw) || contextKw.includes(k));
      if (keywordMatch) {
        score += 5;
        if (!matchedKeywords.includes(contextKw)) {
          matchedKeywords.push(contextKw);
        }
      }

      // Check content
      if (item.content.toLowerCase().includes(contextKw)) {
        score += 2;
        if (!matchedKeywords.includes(contextKw)) {
          matchedKeywords.push(contextKw);
        }
      }
    }

    if (score === 0) continue;

    // Determine relevance level
    let relevance: "high" | "medium" | "low";
    if (score >= 20 && matchedKeywords.length >= 2) {
      relevance = "high";
    } else if (score >= 10) {
      relevance = "medium";
    } else {
      relevance = "low";
    }

    // Generate reason
    const typeMatch = context.types.find((t) =>
      matchedKeywords.some((k) => PROJECT_PATTERNS[t]?.keywords.includes(k))
    );
    let reason: string;
    if (typeMatch) {
      reason = `Matches ${typeMatch} project type`;
    } else if (context.keywords.some((k) => matchedKeywords.includes(k))) {
      reason = "Matches recent git activity";
    } else {
      reason = "Keyword match";
    }

    suggestions.push({
      path: item.path,
      title: item.title,
      tier: item.tier,
      category: item.category,
      relevance,
      reason,
      matchedKeywords: [...new Set(matchedKeywords)],
    });
  }

  // Sort by relevance, then by tier (warm first)
  const relevanceOrder = { high: 0, medium: 1, low: 2 };
  const tierOrder = { warm: 0, cold: 1, icebox: 2 };

  suggestions.sort((a, b) => {
    const relDiff = relevanceOrder[a.relevance] - relevanceOrder[b.relevance];
    if (relDiff !== 0) return relDiff;
    return tierOrder[a.tier] - tierOrder[b.tier];
  });

  return suggestions.slice(0, 15);
}

function formatMarkdown(context: ProjectContext, suggestions: Suggestion[]): string {
  const lines: string[] = [];

  lines.push("## Context-Aware Knowledge Suggestions");
  lines.push("");
  lines.push(`**Project:** ${context.name}`);
  lines.push(`**Path:** \`${context.path}\``);

  if (context.types.length > 0) {
    lines.push(`**Detected Types:** ${context.types.join(", ")}`);
  }

  if (context.keywords.length > 0) {
    lines.push(`**Recent Git Keywords:** ${context.keywords.slice(0, 5).join(", ")}`);
  }

  lines.push("");

  if (suggestions.length === 0) {
    lines.push("No relevant knowledge found for this context.");
    lines.push("");
    lines.push("Try building more knowledge with `/capture` or search with `/capture search <query>`.");
    return lines.join("\n");
  }

  // Group by relevance
  const high = suggestions.filter((s) => s.relevance === "high");
  const medium = suggestions.filter((s) => s.relevance === "medium");
  const low = suggestions.filter((s) => s.relevance === "low");

  if (high.length > 0) {
    lines.push("### Highly Relevant");
    lines.push("");
    for (const s of high) {
      const tierBadge = s.tier === "cold" ? " [archived]" : s.tier === "icebox" ? " [icebox]" : "";
      lines.push(`- **${s.title}**${tierBadge}`);
      lines.push(`  - Path: \`${s.path}\``);
      lines.push(`  - ${s.reason} (${s.matchedKeywords.join(", ")})`);
    }
    lines.push("");
  }

  if (medium.length > 0) {
    lines.push("### May Be Useful");
    lines.push("");
    for (const s of medium) {
      const tierBadge = s.tier === "cold" ? " [archived]" : s.tier === "icebox" ? " [icebox]" : "";
      lines.push(`- **${s.title}**${tierBadge} - \`${s.path}\``);
    }
    lines.push("");
  }

  if (low.length > 0 && high.length === 0 && medium.length === 0) {
    lines.push("### Possible Matches");
    lines.push("");
    for (const s of low.slice(0, 5)) {
      lines.push(`- ${s.title} - \`${s.path}\``);
    }
    lines.push("");
  }

  // Cold item notice
  const coldItems = suggestions.filter((s) => s.tier === "cold");
  if (coldItems.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push(
      `*${coldItems.length} archived item(s) found. Access them to potentially promote back to warm tier.*`
    );
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage:
  bun context-suggest.ts                    Analyze current directory
  bun context-suggest.ts ~/dev/org/repo     Analyze specific path
  bun context-suggest.ts --json             Output as JSON

Detects project type and surfaces relevant knowledge from all tiers.`);
  process.exit(0);
}

const asJson = args.includes("--json");
const pathArg = args.find((a) => !a.startsWith("--"));
const projectPath = pathArg || process.cwd();

if (!existsSync(projectPath)) {
  console.error(`Error: path does not exist: ${projectPath}`);
  process.exit(1);
}

const context = analyzeContext(projectPath);
const suggestions = getSuggestions(context);

if (asJson) {
  console.log(JSON.stringify({ context, suggestions }, null, 2));
} else {
  console.log(formatMarkdown(context, suggestions));
}
