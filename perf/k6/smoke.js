// Smallest performance unit: one authenticated read route under ramping load, plus a
// 1 VU sampler of GET /health so the server-side numbers land in the same report.
//
//   k6 run perf/k6/smoke.js
//   k6 run -e BASE_URL=http://localhost:3000 -e MAX_VUS=100 perf/k6/smoke.js
//
// Point BASE_URL at an API running against a DEDICATED database: setup() registers a user.
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API = `${BASE_URL}/api/v1`;
const MAX_VUS = Number(__ENV.MAX_VUS || 50);

// Server-side saturation, read from /health.
const eventLoopP99 = new Trend("server_event_loop_lag_p99_ms");
const serverRss = new Trend("server_rss_mb");
const serverHeap = new Trend("server_heap_used_mb");
const healthOk = new Rate("health_ok"); // availability
const serverErrors = new Counter("server_errors_5xx");

export const options = {
  scenarios: {
    // Latency, throughput, error rate and concurrency come from this ramp.
    load: {
      executor: "ramping-vus",
      exec: "loadUsersMe",
      startVUs: 1,
      stages: [
        { duration: "20s", target: Math.max(1, Math.floor(MAX_VUS / 2)) },
        { duration: "40s", target: MAX_VUS },
        { duration: "20s", target: 0 },
      ],
    },
    // Availability and saturation are sampled once a second for the whole run.
    server_sampler: {
      executor: "constant-vus",
      exec: "sampleHealth",
      vus: 1,
      duration: "80s",
    },
  },
  thresholds: {
    "http_req_duration{scenario:load}": ["p(95)<200", "p(99)<500"],
    "http_req_failed{scenario:load}": ["rate<0.01"],
    health_ok: ["rate>0.99"],
    server_errors_5xx: ["count==0"],
    server_event_loop_lag_p99_ms: ["p(95)<100"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const json = { headers: { "Content-Type": "application/json" } };

export function setup() {
  const email = `perf-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = "Perf-Test-Passw0rd!-2026";

  const registered = http.post(
    `${API}/auth/register`,
    JSON.stringify({ name: "Perf User", email, password }),
    json,
  );
  if (registered.status !== 201 && registered.status !== 200) {
    fail(`register failed: ${registered.status} ${registered.body}`);
  }

  // Log in once and reuse the token: login is bcrypt-bound and needs its own scenario.
  const login = http.post(`${API}/auth/login`, JSON.stringify({ email, password }), json);
  const accessToken = login.json("data.accessToken");
  if (login.status !== 200 || !accessToken) {
    fail(`login failed: ${login.status} ${login.body}`);
  }
  return { accessToken };
}

export function loadUsersMe(data) {
  const res = http.get(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${data.accessToken}` },
  });
  if (res.status >= 500) serverErrors.add(1);
  check(res, { "users/me is 200": (r) => r.status === 200 });
}

export function sampleHealth() {
  const res = http.get(`${API}/health`);
  const ok = check(res, { "health is 200": (r) => r.status === 200 });
  healthOk.add(ok);
  if (res.status >= 500) serverErrors.add(1);
  if (ok) {
    eventLoopP99.add(res.json("data.eventLoopLagMs.p99"));
    serverRss.add(res.json("data.memory.rssMb"));
    serverHeap.add(res.json("data.memory.heapUsedMb"));
  }
  // One sample per second.
  sleep(1);
}
