#!/usr/bin/env bun
/**
 * Knowledge Search Helper
 * Full-text search across all knowledge tiers with tier-aware ranking
 *
 * Usage:
 *   bun knowledge-search.ts "query"                # Search all tiers
 *   bun knowledge-search.ts "query" --tier warm    # Filter by tier
 *   bun knowledge-search.ts "query" --category patterns  # Filter by category
 *   bun knowledge-search.ts "query" --limit 5      # Limit results
 *   bun knowledge-search.ts --rebuild-index        # Rebuild search index
 *   bun knowledge-search.ts --json                 # Output as JSON
 *
 * Search index: ~/dev/whoabuddy/claude-knowledge/.search-index.json
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative, basename } from "path";

const KNOWLEDGE_BASE = join(process.env.HOME || "", "dev", "whoabuddy", "claude-knowledge");
const INDEX_PATH = join(KNOWLEDGE_BASE, ".search-index.json");
const ACCESS_LOG_PATH = join(KNOWLEDGE_BASE, ".access-log.json");

// Tier configuration
const TIER_DIRS = {
  warm: ["nuggets", "patterns", "runbook", "decisions"],
  cold: ["archive"],
  icebox: ["icebox"],
};

// Tier ranking weights (higher = better)
const TIER_WEIGHTS = {
  warm: 10,
  cold: 5,
  icebox: 1,
};

interface SearchIndexItem {
  path: string;
  tier: "warm" | "cold" | "icebox";
  category: string;
  title: string;
  keywords: string[];
  content: string; // First 500 chars for snippet
  lastAccessed?: string;
  accessCount: number;
}

interface SearchIndex {
  version: 1;
  updated: string;
  items: SearchIndexItem[];
}

interface SearchResult {
  path: string;
  tier: "warm" | "cold" | "icebox";
  category: string;
  title: string;
  snippet: string;
  score: number;
  matchedKeywords: string[];
  accessCount: number;
  lastAccessed?: string;
}

interface AccessLog {
  version: 1;
  updated: string;
  records: Record<string, { accessCount: number; lastAccessed: string }>;
}

function loadAccessLog(): AccessLog | null {
  if (!existsSync(ACCESS_LOG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(ACCESS_LOG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function extractTitle(content: string, filename: string): string {
  // Look for # heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1];

  // Fallback to filename
  return basename(filename, ".md")
    .replace(/-/g, " ")
    .replace(/^\d{4}-/, ""); // Remove ADR prefix
}

function extractKeywords(content: string, title: string): string[] {
  const text = `${title} ${content}`.toLowerCase();

  // Extract words (min 3 chars)
  const words = text
    .replace(/[^a-z0-9\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  // Remove common words
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "was",
    "one",
    "our",
    "out",
    "use",
    "has",
    "have",
    "with",
    "this",
    "that",
    "from",
    "they",
    "will",
    "been",
    "when",
    "more",
    "some",
    "what",
    "there",
    "about",
    "which",
    "would",
    "make",
    "like",
    "just",
    "over",
    "such",
    "into",
    "than",
    "then",
    "only",
  ]);

  const unique = new Set(words.filter((w) => !stopwords.has(w)));

  // Return top keywords by frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    if (!stopwords.has(word)) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

function determineTier(relativePath: string): "warm" | "cold" | "icebox" {
  if (relativePath.startsWith("archive/")) return "cold";
  if (relativePath.startsWith("icebox/")) return "icebox";
  return "warm";
}

function determineCategory(relativePath: string): string {
  const parts = relativePath.split("/");
  // For archive paths like "archive/nuggets/foo.md", return "nuggets"
  if (parts[0] === "archive" && parts.length > 2) {
    return parts[1];
  }
  return parts[0];
}

function getAllMarkdownFiles(): { path: string; fullPath: string }[] {
  const files: { path: string; fullPath: string }[] = [];

  function scanDir(dir: string, relativeTo: string = "") {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relativeTo ? join(relativeTo, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Skip .git and other hidden dirs
        if (!entry.name.startsWith(".")) {
          scanDir(fullPath, relativePath);
        }
      } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        files.push({ path: relativePath, fullPath });
      }
    }
  }

  // Scan warm tier directories
  for (const dir of TIER_DIRS.warm) {
    scanDir(join(KNOWLEDGE_BASE, dir), dir);
  }

  // Scan cold tier (archive)
  for (const dir of TIER_DIRS.cold) {
    scanDir(join(KNOWLEDGE_BASE, dir), dir);
  }

  // Scan icebox
  for (const dir of TIER_DIRS.icebox) {
    scanDir(join(KNOWLEDGE_BASE, dir), dir);
  }

  return files;
}

function buildIndex(): SearchIndex {
  const accessLog = loadAccessLog();
  const files = getAllMarkdownFiles();
  const items: SearchIndexItem[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file.fullPath, "utf-8");
      const title = extractTitle(content, file.path);
      const keywords = extractKeywords(content, title);
      const tier = determineTier(file.path);
      const category = determineCategory(file.path);

      // Get access info
      const accessRecord = accessLog?.records[file.path];

      items.push({
        path: file.path,
        tier,
        category,
        title,
        keywords,
        content: content.slice(0, 500),
        accessCount: accessRecord?.accessCount || 0,
        lastAccessed: accessRecord?.lastAccessed,
      });
    } catch (err) {
      console.error(`Error indexing ${file.path}:`, err);
    }
  }

  const index: SearchIndex = {
    version: 1,
    updated: new Date().toISOString(),
    items,
  };

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  return index;
}

function loadOrBuildIndex(): SearchIndex {
  if (existsSync(INDEX_PATH)) {
    try {
      const index = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));

      // Rebuild if older than 1 hour
      const age = Date.now() - new Date(index.updated).getTime();
      if (age > 60 * 60 * 1000) {
        return buildIndex();
      }

      return index;
    } catch {
      return buildIndex();
    }
  }
  return buildIndex();
}

function search(
  query: string,
  options: {
    tier?: "warm" | "cold" | "icebox";
    category?: string;
    limit?: number;
  } = {}
): SearchResult[] {
  const index = loadOrBuildIndex();
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (queryTerms.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const item of index.items) {
    // Filter by tier
    if (options.tier && item.tier !== options.tier) continue;

    // Filter by category
    if (options.category && item.category !== options.category) continue;

    // Calculate match score
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const term of queryTerms) {
      // Title match (highest weight)
      if (item.title.toLowerCase().includes(term)) {
        score += 10;
        matchedKeywords.push(term);
      }

      // Keyword match
      const keywordMatch = item.keywords.find((k) => k.includes(term) || term.includes(k));
      if (keywordMatch) {
        score += 5;
        if (!matchedKeywords.includes(term)) {
          matchedKeywords.push(term);
        }
      }

      // Content match
      if (item.content.toLowerCase().includes(term)) {
        score += 2;
        if (!matchedKeywords.includes(term)) {
          matchedKeywords.push(term);
        }
      }
    }

    if (score === 0) continue;

    // Apply tier weight
    score *= TIER_WEIGHTS[item.tier];

    // Boost recently accessed items
    if (item.lastAccessed) {
      const daysSinceAccess =
        (Date.now() - new Date(item.lastAccessed).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceAccess < 7) {
        score *= 1.5;
      } else if (daysSinceAccess < 30) {
        score *= 1.2;
      }
    }

    // Boost frequently accessed items
    if (item.accessCount > 0) {
      score *= 1 + Math.min(item.accessCount, 10) * 0.1;
    }

    // Extract snippet around first match
    let snippet = item.content.slice(0, 150);
    for (const term of queryTerms) {
      const idx = item.content.toLowerCase().indexOf(term);
      if (idx >= 0) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(item.content.length, idx + 100);
        snippet = (start > 0 ? "..." : "") + item.content.slice(start, end) + (end < item.content.length ? "..." : "");
        break;
      }
    }

    results.push({
      path: item.path,
      tier: item.tier,
      category: item.category,
      title: item.title,
      snippet: snippet.replace(/\n/g, " ").trim(),
      score,
      matchedKeywords: [...new Set(matchedKeywords)],
      accessCount: item.accessCount,
      lastAccessed: item.lastAccessed,
    });
  }

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  const limit = options.limit || 10;
  return results.slice(0, limit);
}

function formatMarkdown(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `## Search Results for "${query}"\n\nNo matches found.`;
  }

  const lines: string[] = [];
  lines.push(`## Search Results for "${query}"`);
  lines.push("");
  lines.push(`Found ${results.length} matches:`);
  lines.push("");

  for (const result of results) {
    const tierBadge =
      result.tier === "cold" ? " [archived]" : result.tier === "icebox" ? " [icebox]" : "";
    lines.push(`### ${result.title}${tierBadge}`);
    lines.push("");
    lines.push(`**Path:** \`${result.path}\``);
    lines.push(`**Category:** ${result.category} | **Score:** ${result.score.toFixed(1)}`);
    if (result.accessCount > 0) {
      lines.push(
        `**Accessed:** ${result.accessCount} times${result.lastAccessed ? ` (last: ${result.lastAccessed.split("T")[0]})` : ""}`
      );
    }
    lines.push("");
    lines.push(`> ${result.snippet}`);
    lines.push("");
    lines.push(`*Matched: ${result.matchedKeywords.join(", ")}*`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage:
  bun knowledge-search.ts "query"                 Search all tiers
  bun knowledge-search.ts "query" --tier warm     Filter by tier (warm/cold/icebox)
  bun knowledge-search.ts "query" --category patterns  Filter by category
  bun knowledge-search.ts "query" --limit 5       Limit results (default: 10)
  bun knowledge-search.ts --rebuild-index         Rebuild search index
  bun knowledge-search.ts --json                  Output as JSON

Search index: ${INDEX_PATH}`);
  process.exit(0);
}

if (args.includes("--rebuild-index")) {
  console.log("Rebuilding search index...");
  const index = buildIndex();
  console.log(`Indexed ${index.items.length} items.`);
  process.exit(0);
}

// Parse query and options
const asJson = args.includes("--json");
const tierIndex = args.indexOf("--tier");
const categoryIndex = args.indexOf("--category");
const limitIndex = args.indexOf("--limit");

const tier =
  tierIndex >= 0 ? (args[tierIndex + 1] as "warm" | "cold" | "icebox") : undefined;
const category = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

// Get query (first non-flag argument)
const query = args.find((a, i) => {
  if (a.startsWith("--")) return false;
  // Skip if this is an argument value to a flag
  if (tierIndex >= 0 && i === tierIndex + 1) return false;
  if (categoryIndex >= 0 && i === categoryIndex + 1) return false;
  if (limitIndex >= 0 && i === limitIndex + 1) return false;
  return true;
});

if (!query) {
  console.error("Error: query required");
  console.log("Usage: bun knowledge-search.ts \"query\" [options]");
  process.exit(1);
}

const results = search(query, { tier, category, limit });

if (asJson) {
  console.log(JSON.stringify({ query, results }, null, 2));
} else {
  console.log(formatMarkdown(results, query));
}
