import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type MockUser = { email?: string | null } | null;
type DbError = { message: string };
type MeasurementRow = {
  id: string;
  created_at: string | null;
  inventory_item_id: string | null;
  card_identity: string | null;
  face: "front" | "back";
  card_session_id: string | null;
  image_url: string | null;
  overlay?: unknown;
  overlay_geometry: unknown;
  left_pct: number;
  right_pct: number;
  top_pct: number;
  bottom_pct: number;
  worst_axis: "leftRight" | "topBottom";
  worst_axis_max_pct: number;
  psa_ceiling: "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";
  manual_adjustment: boolean;
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

function row(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    id: "front-row",
    created_at: "2026-05-18T10:00:00.000Z",
    inventory_item_id: null,
    card_identity: "Monkey D. Luffy OP01-001",
    face: "front",
    card_session_id: "11111111-1111-4111-8111-111111111111",
    image_url: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg",
    overlay: { coordinateSpace: "imagePixels" },
    overlay_geometry: { outer: {}, inner: {} },
    left_pct: 52,
    right_pct: 48,
    top_pct: 49,
    bottom_pct: 51,
    worst_axis: "leftRight",
    worst_axis_max_pct: 52,
    psa_ceiling: "PSA_10",
    manual_adjustment: false,
    ...overrides,
  };
}

function authMocks(user: MockUser = { email: "admin@example.com" }) {
  return {
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
  };
}

function runRoute(routePath: string, mocks: Record<string, unknown>) {
  function localRequire(specifier: string) {
    if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
      return mocks[specifier];
    }

    return requireFromTest(specifier);
  }

  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  vm.runInContext(
    transpile(routePath),
    vm.createContext({
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      process,
      require: localRequire,
      Request,
      Response,
      URL,
    }),
    { filename: routePath }
  );
  return moduleStub.exports;
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

test("history groups front and back rows and filters by search plus combined ceiling", async () => {
  const routePath = path.resolve("src/app/api/centering/history/route.ts");
  const nullFilters: Array<{ column: string; value: unknown }> = [];
  const rows = [
    row(),
    row({
      id: "back-row",
      created_at: "2026-05-18T10:01:00.000Z",
      face: "back",
      image_url: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/back.jpg",
      left_pct: 59,
      right_pct: 41,
      top_pct: 50,
      bottom_pct: 50,
      worst_axis_max_pct: 59,
      psa_ceiling: "PSA_9",
      manual_adjustment: true,
    }),
    row({
      id: "zoro-row",
      card_session_id: "22222222-2222-4222-8222-222222222222",
      card_identity: "Roronoa Zoro OP01-025",
      psa_ceiling: "PSA_8",
    }),
  ];
  const supabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "centering-images");
        return {
          createSignedUrl(storagePath: string, expiresIn: number) {
            assert.equal(expiresIn, 3600);
            return Promise.resolve({ data: { signedUrl: `signed:${storagePath}` }, error: null });
          },
        };
      },
    },
    from(table: string) {
      assert.equal(table, "centering_measurements");
      const query = {
        select(_columns: string) {
          return query;
        },
        is(column: string, value: unknown) {
          nullFilters.push({ column, value });
          return query;
        },
        order(_column: string, _options: { ascending: boolean }) {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return query;
    },
  };
  const route = runRoute(routePath, {
    ...authMocks(),
    "@/lib/supabase-server": {
      createServiceClient() {
        return supabase;
      },
    },
  }) as { GET: (request: Request) => Promise<Response> };

  const response = await route.GET(new Request("http://localhost/api/centering/history?search=luffy&ceiling=9"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(nullFilters, [{ column: "inventory_item_id", value: null }]);
  assert.equal(body.count, 1);
  assert.equal(body.rows[0].id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.rows[0].ceiling, "PSA_9");
  assert.equal(body.rows[0].manualAdjustment, true);
  assert.equal(body.rows[0].front.signedImageUrl, `signed:${rows[0].image_url}`);
  assert.equal(body.rows[0].back.signedImageUrl, `signed:${rows[1].image_url}`);
});

function loadSessionRoute({
  user = { email: "admin@example.com" },
  sessionRows = [
    row(),
    row({
      id: "back-row",
      face: "back",
      image_url: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/back.jpg",
      psa_ceiling: "PSA_9",
      manual_adjustment: true,
    }),
  ],
  storageRemoveError = null,
  deleteError = null,
  updateError = null,
}: {
  user?: MockUser;
  sessionRows?: MeasurementRow[];
  storageRemoveError?: DbError | null;
  deleteError?: DbError | null;
  updateError?: DbError | null;
} = {}) {
  const routePath = path.resolve("src/app/api/centering/session/[id]/route.ts");
  const signedPaths: string[] = [];
  const removedPaths: string[][] = [];
  const deletedIds: string[][] = [];
  const updates: Record<string, unknown>[] = [];

  const supabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "centering-images");
        return {
          createSignedUrl(storagePath: string, expiresIn: number) {
            assert.equal(expiresIn, 3600);
            signedPaths.push(storagePath);
            return Promise.resolve({ data: { signedUrl: `signed:${storagePath}` }, error: null });
          },
          remove(paths: string[]) {
            removedPaths.push(paths);
            return Promise.resolve({ error: storageRemoveError });
          },
        };
      },
    },
    from(table: string) {
      assert.equal(table, "centering_measurements");
      const query = {
        _filter: { column: "", value: "" },
        select(_columns: string) {
          return query;
        },
        eq(column: string, value: string) {
          query._filter = { column, value };
          return query;
        },
        order(_column: string, _options: { ascending: boolean }) {
          const data =
            query._filter.column === "card_session_id" &&
            query._filter.value === "11111111-1111-4111-8111-111111111111"
              ? sessionRows
              : [];
          return Promise.resolve({ data, error: null });
        },
        delete() {
          return {
            in(_column: string, ids: string[]) {
              deletedIds.push(ids);
              return Promise.resolve({ error: deleteError });
            },
          };
        },
        update(update: Record<string, unknown>) {
          updates.push(update);
          return {
            in(_column: string, _ids: string[]) {
              return {
                select(_columns: string) {
                  return Promise.resolve({
                    data: updateError
                      ? null
                      : sessionRows.map((measurement) => ({ ...measurement, ...update })),
                    error: updateError,
                  });
                },
              };
            },
          };
        },
      };
      return query;
    },
  };

  const route = runRoute(routePath, {
    ...authMocks(user),
    "@/lib/supabase-server": {
      createServiceClient() {
        return supabase;
      },
    },
  }) as {
    GET: (request: Request, context: { params: { id: string } }) => Promise<Response>;
    DELETE: (request: Request, context: { params: { id: string } }) => Promise<Response>;
    PATCH: (request: Request, context: { params: { id: string } }) => Promise<Response>;
  };

  return {
    route,
    signedPaths,
    removedPaths,
    deletedIds,
    updates,
  };
}

test("session GET returns both faces with signed image URLs", async () => {
  const { route, signedPaths } = loadSessionRoute();

  const response = await route.GET(new Request("http://localhost/api/centering/session/11111111-1111-4111-8111-111111111111"), {
    params: { id: "11111111-1111-4111-8111-111111111111" },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.session.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.session.ceiling, "PSA_9");
  assert.equal(body.session.front.id, "front-row");
  assert.equal(body.session.back.id, "back-row");
  assert.deepEqual(signedPaths, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/back.jpg",
  ]);
});

test("session DELETE removes storage objects before deleting rows", async () => {
  const { route, removedPaths, deletedIds } = loadSessionRoute();

  const response = await route.DELETE(new Request("http://localhost/api/centering/session/11111111-1111-4111-8111-111111111111"), {
    params: { id: "11111111-1111-4111-8111-111111111111" },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(removedPaths, [
    [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/front.jpg",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/back.jpg",
    ],
  ]);
  assert.deepEqual(deletedIds, [["front-row", "back-row"]]);
  assert.deepEqual(body, { deleted: 2, storageObjectsDeleted: 2 });
});

test("session PATCH updates card_identity on every row in the session", async () => {
  const { route, updates } = loadSessionRoute();

  const response = await route.PATCH(
    new Request("http://localhost/api/centering/session/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      body: JSON.stringify({ cardIdentity: "Renamed card" }),
    }),
    { params: { id: "11111111-1111-4111-8111-111111111111" } }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{ card_identity: "Renamed card" }]);
  assert.equal(body.session.cardIdentity, "Renamed card");
  assert.equal(body.session.front.id, "front-row");
  assert.equal(body.session.back.id, "back-row");
});
