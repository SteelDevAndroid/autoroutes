import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Agent → serveur MCP → Kafka → backend → SSE → fiche de gare, sur la pile réelle (profils full et mcp).
 * Exécuté seulement avec E2E_AGENT=1. Avec E2E_AGENT_TOKEN_URL (profil auth, MCP_SECURITY_ENABLED=true), l'agent obtient
 * un jeton client credentials (E2E_AGENT_CLIENT_SECRET) et l'interface est ouverte avec le compte « viewer ».
 */
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:8090/mcp';
const TOKEN_URL = process.env.E2E_AGENT_TOKEN_URL;

interface ToolResult {
  readonly isError?: boolean;
  readonly text: string;
}

/** Client MCP minimal (HTTP streamable) : JSON-RPC en POST, réponse JSON ou flux SSE d'un seul message. */
class McpClient {
  private session: string | null = null;
  private id = 0;

  private constructor(private readonly token: string | null) {}

  static async connect(token: string | null): Promise<McpClient> {
    const client = new McpClient(token);
    await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e-agent', version: '1' } });
    await client.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return client;
  }

  async tools(): Promise<string[]> {
    const result = await this.request('tools/list', {}) as { tools: { name: string }[] };
    return result.tools.map((tool) => tool.name);
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.request('tools/call', { name, arguments: args }) as { isError?: boolean; content: { text: string }[] };
    return { isError: result.isError, text: result.content[0]?.text ?? '' };
  }

  async json<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.call(name, args);
    expect(result.isError, result.text).toBeFalsy();
    return JSON.parse(result.text) as T;
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const response = await this.post({ jsonrpc: '2.0', id: ++this.id, method, params });
    const body = await response.text();
    const payload = response.headers.get('content-type')?.includes('text/event-stream')
      ? body.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('')
      : body;
    const message = JSON.parse(payload) as { result?: unknown; error?: { message: string } };
    if (message.error !== undefined) throw new Error(`MCP ${method} : ${message.error.message}`);
    return message.result;
  }

  private async post(message: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (this.session !== null) headers['Mcp-Session-Id'] = this.session;
    if (this.token !== null) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(message) });
    expect(response.status, `${MCP_URL} ${JSON.stringify(message).slice(0, 80)}`).toBeLessThan(300);
    this.session = response.headers.get('mcp-session-id') ?? this.session;
    return response;
  }
}

async function agentToken(): Promise<string | null> {
  if (TOKEN_URL === undefined) return null;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'agent-anomalies', client_secret: process.env.E2E_AGENT_CLIENT_SECRET ?? '' }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function openStation(page: Page, name: string) {
  await page.goto('/');
  if (TOKEN_URL !== undefined) {
    await page.waitForURL(/\/realms\/supervision\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username/i).fill('viewer');
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_VIEWER_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 30_000 });
  await page.getByLabel('Nom de gare').fill(name);
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  return page.getByRole('region', { name: 'Incidents et anomalies' });
}

interface Published { readonly eventTime: string; readonly source: string }
interface State { readonly maSource: string; readonly versionAttendue: string }

test.describe('agent MCP → interface', () => {
  test.skip(process.env.E2E_AGENT !== '1', 'E2E_AGENT=1 requis');

  test('sans jeton, le serveur MCP sécurisé refuse l’agent', async () => {
    test.skip(TOKEN_URL === undefined, 'serveur MCP sans authentification');
    const response = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } }) });
    expect(response.status).toBe(401);
  });

  test('une anomalie déclarée par un agent apparaît dans la fiche avec sa source, puis disparaît quand il la lève', async ({ page }) => {
    const agent = await McpClient.connect(await agentToken());
    expect(await agent.tools()).toEqual(expect.arrayContaining(['rechercher_gares', 'consulter_anomalies', 'declarer_anomalies', 'lever_anomalies']));

    const before = await agent.json<State>('consulter_anomalies', { gare: 'La Boisse' });
    const incident = `Incident E2E agent ${Date.now()}`;
    const published = await agent.json<Published>('declarer_anomalies', {
      gare: 'La Boisse', version_attendue: before.versionAttendue,
      anomalies: [{ type_ano: incident, cardinalite: 2, criticite: 'Critique' }],
    });
    expect(published.source).toBe(before.maSource);
    // Le backend applique le rapport de façon asynchrone : la version lue rejoint celle publiée.
    await expect.poll(async () => (await agent.json<State>('consulter_anomalies', { gare: 'GL-BPV-0054' })).versionAttendue,
      { timeout: 20_000 }).toBe(published.eventTime);

    const sheet = await openStation(page, 'La Boisse');
    const item = sheet.locator('li').filter({ hasText: incident });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item).toContainText(`Agent ${published.source.slice(4)}`);
    await expect(item).toContainText('Critique');
    await page.screenshot({ path: 'test-results/agent-anomalie.png' });

    const stale = await agent.call('lever_anomalies', { gare: 'La Boisse', version_attendue: before.versionAttendue });
    expect(stale.isError).toBe(true);
    await agent.json<Published>('lever_anomalies', { gare: 'La Boisse', version_attendue: published.eventTime });
    await expect(item).toHaveCount(0, { timeout: 20_000 });
  });
});
