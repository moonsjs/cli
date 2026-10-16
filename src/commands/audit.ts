import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadProjectConfig } from "../config-load";
import { collectFns } from "./fns";

export interface AuditCheck {
  id: string;
  level: "pass" | "warn" | "fail";
  title: string;
  detail?: string;
}

export interface AuditJson {
  ok: boolean;
  counts: { pass: number; warn: number; fail: number };
  checks: AuditCheck[];
}

export interface AuditOptions {
  /** String canary milik app (opsional) — ikut dipindai di dist/client. */
  canary?: string;
  /** Bila true, peringatan juga menggagalkan audit (exit 1). */
  strict?: boolean;
  /** Sumber nilai env untuk pemindaian (default `process.env`). */
  env?: Record<string, string | undefined>;
}

/** Nilai env kandidat rahasia: panjang ≥ 16 dan ≥ 2 kelas karakter. */
function looksSecret(value: string): boolean {
  if (value.length < 16) {
    return false;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  return classes >= 2;
}

function walkFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full));
    } else if (entry.isFile() && /\.(js|mjs|html|css|json|txt|map)$/.test(entry.name)) {
      result.push(full);
    }
  }
  return result.sort();
}

function walkSources(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) {
    return result;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkSources(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      result.push(full);
    }
  }
  return result;
}

const ENV_LITERAL = /\benv\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g;

/**
 * Audit keamanan aplikasi terhadap jaminan Moons (Addendum H):
 * inventaris serverFn, peta `env()`, flag cookie, CSP, dan pemindaian
 * `dist/client` untuk nilai env mirip-rahasia + canary. Read-only.
 */
export async function executeAudit(cwd: string, options: AuditOptions = {}): Promise<AuditJson> {
  const checks: AuditCheck[] = [];
  const push = (id: string, level: AuditCheck["level"], title: string, detail?: string): void => {
    checks.push({ id, level, title, ...(detail === undefined ? {} : { detail }) });
  };

  const env = options.env ?? process.env;

  // 1) Inventaris serverFn (pintu RPC yang bisa dipanggil siapa pun).
  const fns = collectFns(cwd);
  push(
    "rpc-inventory",
    "pass",
    `${fns.count} serverFn registered`,
    fns.count === 0 ? "no RPC endpoints" : fns.fns.map((fn) => fn.key).join(", "),
  );

  // 2) Peta akses env() — nilai rahasia hanya boleh dibaca di file server.
  const envKeys = new Set<string>();
  const dynamicEnvFiles: string[] = [];
  for (const file of fns.serverFiles) {
    const source = readFileSync(file, "utf8");
    let matched = false;
    for (const match of source.matchAll(ENV_LITERAL)) {
      envKeys.add(match[1] as string);
      matched = true;
    }
    if (!matched && /\benv\s*\(/.test(source)) {
      dynamicEnvFiles.push(relative(cwd, file));
    }
  }
  push(
    "env-access",
    "pass",
    `${envKeys.size} env() keys detected in server files`,
    envKeys.size === 0
      ? "no literal env() access"
      : [...envKeys].sort().join(", ") +
        (dynamicEnvFiles.length > 0 ? ` · dynamic: ${dynamicEnvFiles.join(", ")}` : ""),
  );

  // 3) Flag cookie pada setCookie() di source.
  const insecureCookies: string[] = [];
  let cookieCalls = 0;
  for (const file of walkSources(join(cwd, "src"))) {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (!/setCookie\s*\(/.test(line)) {
        return;
      }
      cookieCalls += 1;
      const window = lines.slice(index, index + 8).join("\n");
      const missing = [
        /httpOnly|HttpOnly/.test(window) ? null : "HttpOnly",
        /secure|Secure/.test(window) ? null : "Secure",
        /sameSite|SameSite/.test(window) ? null : "SameSite",
      ].filter((item): item is string => item !== null);
      if (missing.length > 0) {
        insecureCookies.push(`${relative(cwd, file)}:${index + 1} (without ${missing.join(", ")})`);
      }
    });
  }
  push(
    "cookie-flags",
    insecureCookies.length === 0 ? "pass" : "warn",
    cookieCalls === 0
      ? "no cookies set"
      : `${cookieCalls} setCookie() · ${insecureCookies.length} missing full flags`,
    insecureCookies.slice(0, 8).join(" · "),
  );

  // 4) CSP & header statis dari config.
  const { config } = await loadProjectConfig(cwd);
  const headers = Object.entries(config.headers ?? {});
  const csp = headers.find(([name]) => name.toLowerCase() === "content-security-policy");
  if (csp === undefined) {
    push(
      "headers-csp",
      "warn",
      "no Content-Security-Policy in `headers`",
      "Add `headers: { \"content-security-policy\": \"default-src 'self'; script-src 'self' 'unsafe-inline'\" }` or another strict CSP",
    );
  } else if (/unsafe-inline|unsafe-eval/.test(csp[1])) {
    push("headers-csp", "warn", "CSP contains `unsafe-inline`/`unsafe-eval`", csp[1]);
  } else {
    push("headers-csp", "pass", "CSP set without unsafe-inline/unsafe-eval", csp[1]);
  }

  // 5) Deploy kit (info).
  const redirects = config.redirects?.length ?? 0;
  const deployParts = [
    `${headers.length} header`,
    `${redirects} redirect`,
    config.sitemap === undefined ? "no sitemap" : "sitemap ✓",
    config.robots === undefined ? "no robots" : "robots ✓",
  ];
  push("deploy-kit", "pass", "static deploy kit", deployParts.join(" · "));

  // 6) Pemindaian dist/client untuk nilai env mirip-rahasia + canary.
  const clientDir = join(cwd, "dist", "client");
  if (existsSync(clientDir)) {
    const secrets: Array<{ label: string; value: string }> = [];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined && !key.startsWith("_") && looksSecret(value)) {
        secrets.push({ label: `env(${key})`, value });
      }
    }
    if (options.canary !== undefined && options.canary.length > 0) {
      secrets.push({ label: "canary", value: options.canary });
    }

    const leaks: string[] = [];
    let scanned = 0;
    for (const file of walkFiles(clientDir)) {
      const text = readFileSync(file, "utf8");
      scanned += 1;
      for (const secret of secrets) {
        if (text.includes(secret.value)) {
          leaks.push(`${relative(cwd, file)} contains ${secret.label}`);
        }
      }
    }
    push(
      "dist-scan",
      leaks.length === 0 ? "pass" : "fail",
      leaks.length === 0
        ? `${scanned} dist/client files scanned (${secrets.length} sensitive values)`
        : `${leaks.length} leaks in dist/client`,
      leaks.slice(0, 8).join(" · "),
    );
  } else {
    push("dist-scan", "warn", "dist/client not found yet — run `moons build` first", clientDir);
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) {
    counts[check.level] += 1;
  }
  const ok = counts.fail === 0 && (!(options.strict ?? false) || counts.warn === 0);
  return { ok, counts, checks };
}

/** `moons audit [--json] [--strict] [--canary <value>]`. */
export async function runAudit(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const canaryIndex = args.indexOf("--canary");
  const canary = canaryIndex === -1 ? undefined : args[canaryIndex + 1];

  const result = await executeAudit(cwd, {
    strict,
    ...(canary === undefined ? {} : { canary }),
    env: process.env,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const check of result.checks) {
      const label = check.level.toUpperCase().padEnd(5);
      console.log(`${label} ${check.id}: ${check.title}`);
      if (check.detail !== undefined && check.detail.length > 0) {
        console.log(`      ${check.detail}`);
      }
    }
    console.log(`summary: ${result.counts.pass} pass · ${result.counts.warn} warn · ${result.counts.fail} fail`);
  }
  return result.ok ? 0 : 1;
}
