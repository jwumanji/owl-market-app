import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type MockUser = { id: string; email?: string | null } | null;
type DbError = { message: string };
type LoadRouteOptions = {
  user?: MockUser;
  uploadError?: DbError | null;
  insertError?: DbError | null;
};

const requireFromTest = createRequire(import.meta.url);

function transpile(filePath: string) {
  return ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadTsModule(filePath: string) {
  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  vm.runInContext(
    transpile(filePath),
    vm.createContext({
      Buffer,
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: filePath }
  );
  return moduleStub.exports;
}

const routePath = path.resolve("src/app/api/centering/save/route.ts");
const routeJavaScript = transpile(routePath);
const mathModule = loadTsModule(path.resolve("src/lib/centering-math.ts"));

function overlay(leftInnerX = 20) {
  return {
    outer: {
      tl: { x: 0, y: 0 },
      tr: { x: 100, y: 0 },
      br: { x: 100, y: 200 },
      bl: { x: 0, y: 200 },
    },
    inner: {
      tl: { x: leftInnerX, y: 20 },
      tr: { x: 80, y: 20 },
      br: { x: 80, y: 180 },
      bl: { x: leftInnerX, y: 180 },
    },
  };
}

function saveRequest({
  finalOverlay = overlay(),
  cvOverlay = finalOverlay,
}: {
  finalOverlay?: ReturnType<typeof overlay>;
  cvOverlay?: ReturnType<typeof overlay> | null;
} = {}) {
  const formData = new FormData();
  formData.set("cardSessionId", "11111111-1111-4111-8111-111111111111");
  formData.set("face", "front");
  formData.set("cardIdentity", "Monkey D. Luffy OP01-001");
  formData.set("imageWidthPx", "100");
  formData.set("imageHeightPx", "200");
  formData.set("pipelineMode", "mock");
  formData.set("pipelineVersion", "0.1.0");
  formData.set("processingMs", "45");
  formData.set("overlayGeometry", JSON.stringify(finalOverlay));
  if (cvOverlay) formData.set("cvOverlayGeometry", JSON.stringify(cvOverlay));
  formData.set("image", new File(["fake image"], "front.jpg", { type: "image/jpeg" }));

  return new Request("http://localhost/api/centering/save", {
    method: "POST",
    body: formData,
  });
}

function loadRoute({
  user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "admin@example.com" },
  uploadError = null,
  insertError = null,
}: LoadRouteOptions = {}) {
  const insertedRows: Record<string, unknown>[] = [];
  const uploads: Array<{ bucket: string; path: string; options: Record<string, unknown> }> = [];
  const removals: Array<{ bucket: string; paths: string[] }> = [];
  let serviceClientCalls = 0;

  const storageBucket = {
    upload(storagePath: string, _bytes: Buffer, options: Record<string, unknown>) {
      uploads.push({ bucket: "centering-images", path: storagePath, options });
      return Promise.resolve({ error: uploadError });
    },
    remove(paths: string[]) {
      removals.push({ bucket: "centering-images", paths });
      return Promise.resolve({ error: null });
    },
  };

  const supabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "centering-images");
        return storageBucket;
      },
    },
    from(table: string) {
      if (table === "centering_measurements") {
        return {
          insert(row: Record<string, unknown>) {
            insertedRows.push(row);
            return {
              select(_columns: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: insertError ? null : { id: "measurement-1", ...row },
                      error: insertError,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "inventory_items") {
        throw new Error("inventory lookup should not run in these tests");
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
    "@/lib/admin-auth": {
      isAllowedAdminEmail(email?: string | null) {
        return email === "admin@example.com";
      },
    },
    "@/lib/centering-math": mathModule,
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
    Buffer,
    console,
    crypto: {
      randomUUID() {
        return "22222222-2222-4222-8222-222222222222";
      },
    },
    exports: moduleStub.exports,
    File,
    FormData,
    module: moduleStub,
    process,
    require: localRequire,
    Request,
    Response,
  });

  vm.runInContext(routeJavaScript, context, { filename: routePath });

  return {
    POST: moduleStub.exports.POST as (request: Request) => Promise<Response>,
    get serviceClientCalls() {
      return serviceClientCalls;
    },
    insertedRows,
    uploads,
    removals,
  };
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

test("anonymous save returns 401 without uploading or inserting", async () => {
  const route = loadRoute({ user: null });

  const response = await route.POST(saveRequest());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(route.serviceClientCalls, 0);
  assert.equal(route.uploads.length, 0);
  assert.equal(route.insertedRows.length, 0);
});

test("save uploads the image and persists computed measurement when overlay matches CV", async () => {
  const route = loadRoute();

  const response = await route.POST(saveRequest());

  assert.equal(response.status, 200);
  assert.equal(route.uploads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(route.uploads[0])), {
    bucket: "centering-images",
    path: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg",
    options: {
      contentType: "image/jpeg",
      upsert: true,
    },
  });
  assert.equal(route.insertedRows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(route.insertedRows[0])), {
    inventory_item_id: null,
    request_id: "22222222-2222-4222-8222-222222222222",
    left_pct: 50,
    right_pct: 50,
    top_pct: 50,
    bottom_pct: 50,
    worst_axis: "leftRight",
    worst_axis_max_pct: 50,
    psa_ceiling: "PSA_10",
    pipeline_mode: "mock",
    pipeline_version: "0.1.0",
    processing_ms: 45,
    image_content_type: "image/jpeg",
    image_width_px: 100,
    image_height_px: 200,
    overlay: {
      coordinateSpace: "imagePixels",
      outerCard: { x: 0, y: 0, width: 100, height: 200 },
      innerFrame: { x: 20, y: 20, width: 60, height: 160 },
      gaps: { leftPx: 20, rightPx: 20, topPx: 20, bottomPx: 20 },
    },
    manual_adjustment: false,
    card_identity: "Monkey D. Luffy OP01-001",
    face: "front",
    card_session_id: "11111111-1111-4111-8111-111111111111",
    image_url: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg",
    overlay_geometry: overlay(),
  });
});

test("save marks manual_adjustment when final overlay differs from CV overlay", async () => {
  const route = loadRoute();

  const response = await route.POST(saveRequest({ finalOverlay: overlay(25), cvOverlay: overlay(20) }));

  assert.equal(response.status, 200);
  assert.equal(route.insertedRows.length, 1);
  assert.equal(route.insertedRows[0].manual_adjustment, true);
  assert.equal(route.insertedRows[0].left_pct, 55.56);
  assert.equal(route.insertedRows[0].right_pct, 44.44);
  assert.equal(route.insertedRows[0].psa_ceiling, "PSA_9");
});

test("storage upload errors stop before database insert", async () => {
  const route = loadRoute({ uploadError: { message: "storage unavailable" } });

  const response = await route.POST(saveRequest());

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "storage unavailable" });
  assert.equal(route.uploads.length, 1);
  assert.equal(route.insertedRows.length, 0);
});

test("database insert errors clean up the uploaded storage object", async () => {
  const route = loadRoute({ insertError: { message: "insert failed" } });

  const response = await route.POST(saveRequest());

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "insert failed" });
  assert.equal(route.uploads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(route.removals)), [
    {
      bucket: "centering-images",
      paths: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg"],
    },
  ]);
});
