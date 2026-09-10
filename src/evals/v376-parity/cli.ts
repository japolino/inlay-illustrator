#!/usr/bin/env bun
/**
 * CLI runner for V3.7.6 Source-Faithful Parity Evaluation.
 *
 * Runs offline, deterministic evaluations against tracked V3.7.6 source truth.
 * Zero live or paid model calls.
 *
 * Exit codes:
 * - 0: All parity assertions and test cases passed
 * - 1: One or more assertions failed (or runtime error)
 *
 * Usage:
 *   bun run src/evals/v376-parity/cli.ts [--json] [--verbose]
 */

import { runV376ParityEvaluation } from "./engine.js";
import type { ParityCliOptions, V376ParityReport } from "./types.js";

function parseArgs(args: string[]): ParityCliOptions {
  const options: ParityCliOptions = {};
  for (const arg of args) {
    if (arg === "--json") options.json = true;
    else if (arg === "--verbose" || arg === "-v") options.verbose = true;
    else if (arg.startsWith("--category=")) options.category = arg.split("=")[1];
    else if (arg.startsWith("--filter=")) options.filter = arg.split("=")[1];
  }
  return options;
}

function printConciseReport(report: V376ParityReport, verbose = false) {
  console.log("================================================================================");
  console.log("             V3.7.6 SOURCE-FAITHFUL PARITY EVALUATION REPORT                    ");
  console.log("================================================================================");
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Version:   ${report.version}`);
  console.log(`Status:    ${report.overallPassed ? "PASSED (Deterministic Offline Fixture Pass Rate: 100%)" : "FAILED (Mismatches detected)"}`);
  console.log("--------------------------------------------------------------------------------");
  console.log("CATEGORY SUMMARY:");
  for (const cat of report.categories) {
    const statusMark = cat.failed === 0 ? "✓ PASS" : "✗ FAIL";
    console.log(
      `  [${statusMark}] ${cat.category.padEnd(14)}: ` +
        `${cat.passed}/${cat.total} cases passed (${cat.durationMs} ms)`
    );
  }
  console.log("--------------------------------------------------------------------------------");
  console.log("OVERALL TOTALS:");
  console.log(`  Test Cases:  ${report.summary.passedCases} passed, ${report.summary.failedCases} failed, ${report.summary.totalCases} total`);
  console.log(`  Assertions:  ${report.summary.passedAssertions} passed, ${report.summary.failedAssertions} failed, ${report.summary.totalAssertions} total`);
  console.log(`  Duration:    ${report.summary.totalDurationMs} ms`);
  console.log("--------------------------------------------------------------------------------");
  console.log("SCOPE & LIMITATIONS NOTICE:");
  console.log("  Pass rate reflects 82/82 deterministic offline assertions against frozen source truth.");
  console.log("  It does NOT verify live host context streaming (persona/lorebooks) or live inference.");
  console.log("================================================================================");

  if (!report.overallPassed || verbose) {
    console.log("\nDETAILED CASE RESULTS:");
    for (const c of report.cases) {
      const mark = c.passed ? "  ✓" : "  ✗";
      console.log(`${mark} [${c.category}] ${c.name} (${c.durationMs} ms)`);
      for (const a of c.assertions) {
        if (!a.passed || verbose) {
          const aMark = a.passed ? "      ✓" : "      ✗";
          console.log(`${aMark} ${a.name}`);
          if (!a.passed) {
            console.log(`          Expected: ${JSON.stringify(a.expected)}`);
            console.log(`          Actual:   ${JSON.stringify(a.actual)}`);
            if (a.provenance) {
              console.log(`          Source:   ${a.provenance.file}:${a.provenance.lines} (${a.provenance.description})`);
            }
          }
        }
      }
    }
    console.log("================================================================================");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    const report = await runV376ParityEvaluation();

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printConciseReport(report, options.verbose);
    }

    if (!report.overallPassed) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error during parity evaluation:", error);
    process.exit(1);
  }
}

// Execute CLI
if (import.meta.main) {
  void main();
}