/** Local HTTP integration tests with an explicit fake upstream admin service. */
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp, type StorefrontConfig } from '../server/app.ts';

const SECRET = 'server-to-server-secret-test-only';
const ADMIN = 'https://admin.internal.invalid';
const PRODUCT = { id: 'TEST-1', code: 'TEST-1', name: 'Test product', description: 'Description', group: 'Headless Demo', uom: 'Nos', image: null, disabled: false, isStockItem: true, hasVariants: false, variantOf: null, attributes: [], modified: '2026-09-17 10:00:00.000000' };
const LIST = { data: [PRODUCT], meta: { page: 1, pageSize: 20, hasMore: false, source: 'frappe' } };
type Call = { url: URL; init: RequestInit; headers: Headers };
function json(payload: unknown, status = 200, headers?: HeadersInit) { const h = new Headers(headers); h.set('Content-Type', 'application/json'); return new Response(JSON.stringify(payload), { status, headers: h }); }

async function harness(t: TestContext, responses: Array<Response | Error>, overrides: Partial<StorefrontConfig> = {}) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({ url: new URL(String(input)), init, headers: new Headers(init.headers) });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fake-upstream call');
    if (next instanceof Error) throw next;
    return next;
  };
  const server = createApp({ adminUrl: ADMIN, catalogSecret: SECRET, production: false, ...overrides }, fetcher).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, redirect: 'manual' });
  return { request, calls };
}

test('server sends only its own catalog credential upstream and never forwards cookies or secrets to the browser', async t => {
  const { request, calls } = await harness(t, [json(LIST, 200, { 'Set-Cookie': 'upstream_session=private; HttpOnly', 'X-Internal-Secret': SECRET })]);
  const response = await request('/api/v1/products?q=Table&page=2&pageSize=12&sort=name', { headers: { Authorization: 'Bearer browser-controlled-token', Cookie: 'mf_admin_session=browser-cookie', 'X-Frappe-CSRF-Token': 'browser-csrf' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), LIST);
  assert.equal(calls[0].url.origin, ADMIN);
  assert.equal(calls[0].url.pathname, '/api/v1/catalog/products');
  assert.equal(calls[0].url.searchParams.get('q'), 'Table');
  assert.equal(calls[0].headers.get('Authorization'), `Bearer ${SECRET}`);
  assert.equal(calls[0].headers.get('Cookie'), null);
  assert.equal(calls[0].headers.get('X-Frappe-CSRF-Token'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('X-Internal-Secret'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('product detail encodes the entire identifier under the fixed catalog route', async t => {
  const detail = { data: { product: PRODUCT, variants: [] }, meta: { source: 'frappe' } };
  const { request, calls } = await harness(t, [json(detail)]);
  const response = await request(`/api/v1/products/${encodeURIComponent('SKU / A?private=true')}`);
  assert.equal(response.status, 200);
  assert.equal(calls[0].url.href, `${ADMIN}/api/v1/catalog/products/SKU%20%2F%20A%3Fprivate%3Dtrue`);
  assert.deepEqual(await response.json(), detail);
});

test('write methods and generic proxy routes never reach the admin service', async t => {
  const { request, calls } = await harness(t, []);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await request('/api/v1/products/TEST-1', { method });
    assert.equal(response.status, 404);
  }
  for (const path of ['/api/resource/User', '/api/method/login', '/api/v1/proxy?url=https://attacker.invalid']) {
    assert.equal((await request(path)).status, 404);
  }
  assert.equal(calls.length, 0);
});

test('query limits reject arbitrary parameters, non-active status and malformed pagination before fetching', async t => {
  const { request, calls } = await harness(t, []);
  for (const query of ['pageSize=51', 'page=0', 'page=1.5', 'page=10001', 'status=all', 'status=disabled', 'sort=secret_field', 'fields=*', 'url=https://attacker.invalid', `q=${'a'.repeat(101)}`, 'q=a&q=b']) {
    const response = await request(`/api/v1/products?${query}`);
    assert.equal(response.status, 422, query);
    assert.equal((await response.json()).title, 'INVALID_QUERY');
  }
  assert.equal(calls.length, 0);
});

test('overlong Item IDs fail validation without reaching upstream', async t => {
  const { request, calls } = await harness(t, []);
  assert.equal((await request(`/api/v1/products/${'a'.repeat(141)}`)).status, 422);
  assert.equal(calls.length, 0);
});

test('missing credentials produces a clear 503 instead of a mock catalog', async t => {
  const { request, calls } = await harness(t, [], { catalogSecret: '' });
  const response = await request('/api/v1/products');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.title, 'CATALOG_NOT_CONFIGURED');
  assert.equal('data' in body, false);
  assert.equal(calls.length, 0);
});

for (const [label, upstream] of [
  ['transport failure', new Error('private upstream connection string')],
  ['non-JSON response', new Response('<html>not JSON</html>')],
  ['unexpected JSON contract', json({ products: [PRODUCT] })],
  ['false source marker', json({ ...LIST, meta: { ...LIST.meta, source: 'mock' } })],
  ['invalid data shape', json({ data: 'not an array', meta: LIST.meta })],
  ['invalid product shape', json({ ...LIST, data: [{ id: 'TEST-1' }] })],
] as const) {
  test(`${label} never becomes a successful catalog or mock fallback`, async t => {
    const { request } = await harness(t, [upstream]);
    const response = await request('/api/v1/products');
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal('data' in body, false);
    assert.doesNotMatch(JSON.stringify(body), /private upstream connection string/);
  });
}

test('unexpected upstream private fields are not included in the public DTO', async t => {
  const { request } = await harness(t, [json({ ...LIST, api_secret: SECRET, data: [{ ...PRODUCT, private_token: 'private-value-never-for-client' }] })]);
  const response = await request('/api/v1/products');
  assert.ok([200, 502].includes(response.status), 'Unexpected extra upstream fields must be stripped or rejected.');
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(`${SECRET}|private-value-never-for-client`));
});

test('upstream error details and arbitrary titles cannot leak server credentials', async t => {
  const { request } = await harness(t, [json({ title: SECRET, detail: 'internal bearer credential', exc: 'private stack trace' }, 403)]);
  const response = await request('/api/v1/products');
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(`${SECRET}|internal bearer credential|private stack trace`));
  assert.equal(JSON.parse(text).title, 'CATALOG_ERROR');
});

for (const status of [404, 422, 429, 503, 504]) {
  test(`preserves actionable upstream status ${status} without returning internal error payload`, async t => {
    const { request } = await harness(t, [json({ title: 'INTERNAL_TEST_ERROR', detail: 'private implementation detail' }, status)]);
    const response = await request('/api/v1/products');
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.status, status);
    assert.doesNotMatch(JSON.stringify(body), /private implementation detail/);
    assert.equal('data' in body, false);
  });
}

test('variants route uses the fixed catalog endpoint, encoded parent and bounded page contract', async t => {
  const payload = { data: [{ ...PRODUCT, variantOf: 'TEMPLATE / BLUE' }], meta: { page: 2, pageSize: 10, hasMore: true, source: 'frappe' } };
  const { request, calls } = await harness(t, [json(payload)]);
  const response = await request(`/api/v1/products/${encodeURIComponent('TEMPLATE / BLUE')}/variants?page=2&pageSize=10&sort=code&status=active`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, ADMIN);
  assert.equal(calls[0].url.pathname, '/api/v1/catalog/products/TEMPLATE%20%2F%20BLUE/variants');
  assert.equal(calls[0].url.searchParams.get('page'), '2');
  assert.equal(calls[0].url.searchParams.get('pageSize'), '10');
  assert.equal(calls[0].headers.get('Authorization'), `Bearer ${SECRET}`);
});

test('variants route rejects unknown query parameters, unbounded pages and overlong parent IDs', async t => {
  const { request, calls } = await harness(t, []);
  for (const query of ['pageSize=51', 'page=0', 'page=10001', 'fields=*', 'status=all']) {
    const response = await request(`/api/v1/products/TEMPLATE/variants?${query}`);
    assert.equal(response.status, 422, query);
  }
  assert.equal((await request(`/api/v1/products/${'a'.repeat(141)}/variants`)).status, 422);
  assert.equal(calls.length, 0);
});

test('variants route never forwards a public mutation', async t => {
  const { request, calls } = await harness(t, []);
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request('/api/v1/products/TEMPLATE/variants', { method })).status, 404);
  assert.equal(calls.length, 0);
});

test('variants route rejects a detail-shaped response rather than mistaking it for a page', async t => {
  const { request } = await harness(t, [json({ data: { product: PRODUCT, variants: [] }, meta: { source: 'frappe' } })]);
  const response = await request('/api/v1/products/TEMPLATE/variants');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).title, 'INVALID_RESPONSE');
});

test('variants route paging metadata also survives the initial product-detail projection', async t => {
  const payload = { data: { product: { ...PRODUCT, hasVariants: true }, variants: [] }, meta: { source: 'frappe', variants: { page: 1, pageSize: 50, hasMore: true } } };
  const { request } = await harness(t, [json(payload)]);
  const response = await request('/api/v1/products/TEMPLATE');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).meta.variants, { page: 1, pageSize: 50, hasMore: true });
});
