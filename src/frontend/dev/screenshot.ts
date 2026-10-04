/**
 * Headless screenshots of the dev preview (Edge or Chrome).
 *   bun run src/frontend/dev/screenshot.ts [name=hash ...] [--out=dir] [--no-build] [--only=desktop|mobile]
 * Example: bun run src/frontend/dev/screenshot.ts assets=open=assets settings-model=settings=model
 * Writes <out>/<name>-desktop.png (1440x900) and <out>/<name>-mobile.png (390x844). Default out: .cache/ui-shots
 * Env BROWSER overrides the browser path; II_PREVIEW_DIR sets a private preview build dir.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { buildPreview, PREVIEW_DIR } from "./build-preview.js";

const CANDIDATES = [
  process.env.BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter((p): p is string => !!p);

export const SIZES = { desktop: [1440, 900], mobile: [390, 844] } as const;

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

export async function screenshots(shots: Array<{ name: string; hash: string }>, options: { out?: string; build?: boolean; only?: keyof typeof SIZES; budgetMs?: number } = {}): Promise<string[]> {
  const browser = CANDIDATES.find((p) => existsSync(p));
  if (!browser) throw new Error("No Chrome/Edge found; set BROWSER.");
  if (options.build !== false) await buildPreview();
  const out = resolve(options.out ?? join(PREVIEW_DIR, "../ui-shots"));
  mkdirSync(out, { recursive: true });
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const file = join(PREVIEW_DIR, path === "/" ? "index.html" : path.slice(1));
      if (!file.startsWith(PREVIEW_DIR) || !existsSync(file)) return new Response("not found", { status: 404 });
      return new Response(readFileSync(file), { headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
    }
  });
  const written: string[] = [];
  try {
    for (const shot of shots) {
      for (const [kind, [w, h]] of Object.entries(SIZES)) {
        if (options.only && options.only !== kind) continue;
        const file = join(out, `${shot.name}-${kind}.png`);
        rmSync(file, { force: true });
        const args = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
          `--user-data-dir=${PREVIEW_DIR}-browser-profile`, `--window-size=${w},${h}`, `--virtual-time-budget=${options.budgetMs ?? 6000}`,
          ...(kind === "mobile" ? ["--force-device-scale-factor=1", "--touch-events=enabled"] : []),
          `--screenshot=${file}`, `http://127.0.0.1:${server.port}/index.html#${shot.hash}`];
        // Async spawn: a sync spawn would block this process's preview server.
        const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
        const timer = setTimeout(() => proc.kill(), 90_000);
        await proc.exited;
        clearTimeout(timer);
        if (!existsSync(file)) throw new Error(`screenshot failed for ${shot.name} (${kind}): ${(await new Response(proc.stderr).text()).slice(-800)}`);
        written.push(file);
      }
    }
  } finally {
    server.stop(true);
  }
  return written;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const shots = argv.filter((a) => !a.startsWith("--")).map((a) => {
    const i = a.indexOf("=");
    return { name: a.slice(0, i), hash: a.slice(i + 1) };
  });
  const only = argv.find((a) => a.startsWith("--only="))?.slice(7) as keyof typeof SIZES | undefined;
  const out = argv.find((a) => a.startsWith("--out="))?.slice(6);
  const files = await screenshots(shots.length ? shots : [{ name: "assets", hash: "open=assets" }], { out, only, build: !argv.includes("--no-build") });
  console.log(files.join("\n"));
}
