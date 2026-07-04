import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type MockUser = { email?: string | null } | null;
type DbError = { message: string };
type LoadRouteOptions = {
  user?: MockUser;
  inventoryFound?: boolean;
  cvResponse?: Response;
  insertError?: DbError | null;
};

const onePieceGame = {
  id: "game-one-piece",
  slug: "one_piece",
  name: "One Piece Card Game",
  is_active: true,
  is_public: true,
  metadata: { route_slug: "one-piece" },
};

const requireFromTest = createRequire(import.meta.url);
const routePath = path.resolve("src/app/api/centering/measure/route.ts");
const routeSource = fs.readFileSync(routePath, "utf8");
const routeJavaScript = ts.transpileModule(routeSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mathPath = path.resolve("src/lib/centering-math.ts");
const mathJavaScript = ts.transpileModule(fs.readFileSync(mathPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadMathModule() {
  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  vm.runInContext(
    mathJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: mathPath }
  );
  return moduleStub.exports;
}

function measurementResponse({
  leftPercent = 52,
  rightPercent = 48,
  worstAxisMaxPercent = 52,
}: {
  leftPercent?: number;
  rightPercent?: number;
  worstAxisMaxPercent?: number;
} = {}) {
  return {
    image: {
      contentType: "image/jpeg",
      widthPx: 1024,
      heightPx: 1428,
    },
    centering: {
      leftRight: {
        leftPercent,
        rightPercent,
      },
      topBottom: {
        topPercent: 49,
        bottomPercent: 51,
      },
      worstAxis: "leftRight",
      worstAxisMaxPercent,
    },
    psa: {
      ceiling: "PSA_10",
      label: "PSA 10 centering ceiling",
      thresholds: [],
    },
    overlay: {
      coordinateSpace: "imagePixels",
      outerCard: {
        x: 32,
        y: 28,
        width: 960,
        height: 1372,
      },
      innerFrame: {
        x: 118,
        y: 134,
        width: 792,
        height: 1164,
      },
      gaps: {
        leftPx: 86,
        rightPx: 82,
        topPx: 106,
        bottomPx: 102,
      },
    },
    pipeline: {
      mode: "mock",
      version: "0.1.0",
    },
    metadata: {
      processingMs: 42,
      warnings: [],
    },
  };
}

type MeasurementRequestOptions = {
  face?: string;
  cardSessionId?: string;
  cardIdentity?: string;
  game?: string;
  headers?: HeadersInit;
};

// Supports both calling conventions merged from the two branches:
//   measurementRequest(id, "one_piece", headers)          — game-scope tests (main)
//   measurementRequest(id, { face, cardSessionId, ... })  — Owl Lens tests (HEAD)
function measurementRequest(
  inventoryItemId = "inventory-1",
  gameOrOptions: string | MeasurementRequestOptions = {},
  headers?: HeadersInit
) {
  const options: MeasurementRequestOptions =
    typeof gameOrOptions === "string" ? { game: gameOrOptions, headers } : gameOrOptions;

  const formData = new FormData();
  if (inventoryItemId) {
    formData.set("inventoryItemId", inventoryItemId);
  }
  if (options.face !== undefined) formData.set("face", options.face);
  if (options.cardSessionId !== undefined) formData.set("cardSessionId", options.cardSessionId);
  if (options.cardIdentity !== undefined) formData.set("cardIdentity", options.cardIdentity);
  formData.set("game", options.game ?? "one_piece");
  formData.set("file", new File(["fake image"], "card.jpg", { type: "image/jpeg" }));

  return new Request("http://localhost/api/centering/measure", {
    method: "POST",
    headers: options.headers,
    body: formData,
  });
}

function loadRoute({
  user = { email: "admin@example.com" },
  inventoryFound = true,
  cvResponse = Response.json(measurementResponse()),
  insertError = null,
}: LoadRouteOptions = {}) {
  const insertedRows: Record<string, unknown>[] = [];
  const cvCalls: { url: string; init: RequestInit }[] = [];
  const inventoryLookups: string[] = [];
  let serviceClientCalls = 0;

  const supabase = {
    from(table: string) {
      if (table === "games") {
        let matched = true;
        const query = {
          select(_columns: string) {
            return query;
          },
          eq(column: string, value: string | boolean) {
            if (column === "slug") {
              matched = value === onePieceGame.slug;
            } else if (column === "id") {
              matched = value === onePieceGame.id;
            }
            return query;
          },
          filter(column: string, _operator: string, value: string) {
            if (column === "metadata->>route_slug") {
              matched = value === onePieceGame.metadata.route_slug;
            }
            return query;
          },
          maybeSingle() {
            return Promise.resolve({ data: matched ? onePieceGame : null, error: null });
          },
        };
        return query;
      }

      if (table === "inventory_items") {
        let selectedId = "";
        let selectedGameId = "";
        const query = {
          select(_columns: string) {
            return query;
          },
          eq(column: string, value: string) {
            if (column === "id") {
              selectedId = value;
            } else if (column === "game_id") {
              selectedGameId = value;
            }
            return query;
          },
          async single() {
            inventoryLookups.push(selectedId);
            if (!inventoryFound || selectedGameId !== onePieceGame.id) {
              return { data: null, error: { message: "not found" } };
            }

            return { data: { id: selectedId, game_id: selectedGameId }, error: null };
          },
        };

        return query;
      }

      if (table === "centering_measurements") {
        return {
          insert(row: Record<string, unknown>) {
            insertedRows.push(row);
            return Promise.resolve({ error: insertError });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const mocks: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json(body: unknown, init?: ResponseInit) {
          return Response.json(body, init);
        },
      },
    },
    "next/headers": {
      cookies() {
        return {
          get() {
            return undefined;
          },
          set() {
            return undefined;
          },
        };
      },
    },
    "@supabase/ssr": {
      createServerClient() {
        return {
          auth: {
            async getUser() {
              return { data: { user } };
            },
          },
        };
      },
    },
    "@/lib/admin-action-token": {
      CENTERING_MEASURE_ACTION: "centering:measure",
      verifyAdminActionToken(token: string | null, action: string) {
        if (token === "valid-admin-action-token" && action === "centering:measure") {
          return { ok: true, user: { id: "token-admin", email: "admin@example.com" } };
        }
        return { ok: false, reason: "invalid" };
      },
    },
    "@/lib/admin-auth": {
      isAllowedAdminEmail(email?: string | null) {
        return email === "admin@example.com";
      },
    },
    "@/lib/centering-math": loadMathModule(),
    "@/lib/inventory-scans": {
      isUploadFile(value: FormDataEntryValue | null) {
        return value instanceof File && value.size > 0;
      },
    },
    "@/lib/supabase-server": {
      createServiceClient() {
        serviceClientCalls += 1;
        return supabase;
      },
    },
  };

  function localRequire(specifier: string) {
    if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
      return mocks[specifier];
    }

    return requireFromTest(specifier);
  }

  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  const context = vm.createContext({
    console,
    crypto: {
      randomUUID() {
        return "00000000-0000-4000-8000-000000000001";
      },
    },
    exports: moduleStub.exports,
    fetch(input: string | URL | Request, init?: RequestInit) {
      cvCalls.push({ url: String(input), init: init ?? {} });
      return Promise.resolve(cvResponse);
    },
    File,
    FormData,
    Headers,
    module: moduleStub,
    process,
    require: localRequire,
    Request,
    Response,
  });

  vm.runInContext(routeJavaScript, context, { filename: routePath });

  return {
    POST: moduleStub.exports.POST as (request: Request) => Promise<Response>,
    cvCalls,
    inventoryLookups,
    get serviceClientCalls() {
      return serviceClientCalls;
    },
    insertedRows,
  };
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.OWL_LENS_CV_URL = "https://owl-lens.example";
});

test("anonymous request returns 401 without DB write or CV call", async () => {
  const route = loadRoute({ user: null });

  const response = await route.POST(measurementRequest());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(route.serviceClientCalls, 0);
  assert.equal(route.cvCalls.length, 0);
  assert.equal(route.insertedRows.length, 0);
});

test("non-admin authenticated request returns 403 without DB write or CV call", async () => {
  const route = loadRoute({ user: { email: "not-admin@example.com" } });

  const response = await route.POST(measurementRequest());

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "This account is not allowed to access internal tools." });
  assert.equal(route.serviceClientCalls, 0);
  assert.equal(route.cvCalls.length, 0);
  assert.equal(route.insertedRows.length, 0);
});

test("valid admin action token authorizes when Supabase session is not visible to the POST", async () => {
  const cvBody = measurementResponse();
  const cvText = JSON.stringify(cvBody);
  const route = loadRoute({
    user: null,
    cvResponse: new Response(cvText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  const response = await route.POST(
    measurementRequest("", "one_piece", {
      "x-admin-action-token": "valid-admin-action-token",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), cvText);
  assert.equal(route.serviceClientCalls, 1);
  assert.equal(route.cvCalls.length, 1);
  assert.equal(route.insertedRows.length, 1);
  assert.equal(route.insertedRows[0].inventory_item_id, null);
});

test("authenticated request with invalid inventoryItemId returns 404", async () => {
  const route = loadRoute({ inventoryFound: false });

  const response = await route.POST(measurementRequest("missing-item"));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Inventory item not found" });
  assert.equal(route.cvCalls.length, 0);
  assert.equal(route.insertedRows.length, 0);
});

test("happy path forwards CV response and inserts centering measurement", async () => {
  const cvBody = measurementResponse();
  const cvText = JSON.stringify(cvBody);
  const route = loadRoute({
    cvResponse: new Response(cvText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  const response = await route.POST(measurementRequest("inventory-1"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(await response.text(), cvText);
  assert.equal(route.cvCalls.length, 1);
  assert.equal(route.cvCalls[0].url, "https://owl-lens.example/measure");
  assert.deepEqual(route.inventoryLookups, ["inventory-1"]);
  assert.equal(route.insertedRows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(route.insertedRows[0])), {
    game_id: "game-one-piece",
    inventory_item_id: "inventory-1",
    request_id: "00000000-0000-4000-8000-000000000001",
    left_pct: 52,
    right_pct: 48,
    top_pct: 49,
    bottom_pct: 51,
    worst_axis: "leftRight",
    worst_axis_max_pct: 52,
    psa_ceiling: "PSA_10",
    bgs_ceiling: "BGS_9_5",
    tag_ceiling: "TAG_10_GEM_MINT",
    pipeline_mode: "mock",
    pipeline_version: "0.1.0",
    processing_ms: 42,
    image_content_type: "image/jpeg",
    image_width_px: 1024,
    image_height_px: 1428,
    overlay: cvBody.overlay,
    manual_adjustment: false,
    card_identity: null,
    face: "front",
    card_session_id: null,
    overlay_geometry: {
      outer: {
        tl: { x: 32, y: 28 },
        tr: { x: 992, y: 28 },
        br: { x: 992, y: 1400 },
        bl: { x: 32, y: 1400 },
      },
      inner: {
        tl: { x: 118, y: 134 },
        tr: { x: 910, y: 134 },
        br: { x: 910, y: 1298 },
        bl: { x: 118, y: 1298 },
      },
    },
  });
});

test("optional face, cardSessionId, and cardIdentity metadata are persisted", async () => {
  const cvBody = measurementResponse();
  const route = loadRoute({
    cvResponse: Response.json(cvBody),
  });

  const response = await route.POST(
    measurementRequest("inventory-1", {
      face: "back",
      cardSessionId: "11111111-1111-4111-8111-111111111111",
      cardIdentity: "Monkey D. Luffy OP01-001",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(route.insertedRows.length, 1);
  assert.equal(route.insertedRows[0].face, "back");
  assert.equal(route.insertedRows[0].card_session_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(route.insertedRows[0].card_identity, "Monkey D. Luffy OP01-001");
});

test("persisted measure uses face-aware PSA ceiling instead of CV-provided ceiling", async () => {
  const cvBody = measurementResponse({
    leftPercent: 70.26,
    rightPercent: 29.74,
    worstAxisMaxPercent: 70.26,
  });
  cvBody.psa.ceiling = "PSA_8";
  const route = loadRoute({
    cvResponse: Response.json(cvBody),
  });

  const response = await route.POST(measurementRequest("inventory-1", { face: "back" }));

  assert.equal(response.status, 200);
  assert.equal(route.insertedRows.length, 1);
  assert.equal(route.insertedRows[0].psa_ceiling, "PSA_10");
  // BGS/TAG are persisted face-aware (back functions) on the measure path too.
  assert.equal(route.insertedRows[0].bgs_ceiling, "BGS_9");
  assert.equal(route.insertedRows[0].tag_ceiling, "TAG_9");
});

test("standalone request without inventoryItemId persists a null inventory link", async () => {
  const cvBody = measurementResponse();
  const cvText = JSON.stringify(cvBody);
  const route = loadRoute({
    inventoryFound: false,
    cvResponse: new Response(cvText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  const response = await route.POST(measurementRequest(""));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), cvText);
  assert.deepEqual(route.inventoryLookups, []);
  assert.equal(route.cvCalls.length, 1);
  assert.equal(route.insertedRows.length, 1);
  assert.equal(route.insertedRows[0].game_id, "game-one-piece");
  assert.equal(route.insertedRows[0].inventory_item_id, null);
  assert.equal(route.insertedRows[0].psa_ceiling, "PSA_10");
});

test("CV 422 response is forwarded without inserting a row", async () => {
  const errorBody = {
    error: {
      code: "CARD_NOT_DETECTED",
      message: "No card boundary could be detected.",
      details: { requestId: "request-1" },
    },
  };
  const errorText = JSON.stringify(errorBody);
  const route = loadRoute({
    cvResponse: new Response(errorText, {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  });

  const response = await route.POST(measurementRequest());

  assert.equal(response.status, 422);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(await response.text(), errorText);
  assert.equal(route.cvCalls.length, 1);
  assert.equal(route.insertedRows.length, 0);
});

test("measure requires a game scope — a request with no game returns 400 before the CV (regression: Owl Lens wizard)", async () => {
  // The pre-grade wizard's measureFace must send `game`. Without it the merged route 400s
  // at resolveGameScope before the CV is ever called — which previously surfaced to the user
  // as a misleading "...under 20 MB" upload error on the Upload pane.
  const route = loadRoute();
  const formData = new FormData();
  formData.set("inventoryItemId", "inventory-1");
  formData.set("file", new File(["fake image"], "card.jpg", { type: "image/jpeg" }));
  const request = new Request("http://localhost/api/centering/measure", {
    method: "POST",
    body: formData,
  });

  const response = await route.POST(request);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /game is required/i);
  assert.equal(route.cvCalls.length, 0);
});
