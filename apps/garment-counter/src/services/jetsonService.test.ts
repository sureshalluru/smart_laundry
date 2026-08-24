import { JetsonService, TransactionConflictError } from './jetsonService';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('JetsonService', () => {
  it('startTransaction builds a GET /transaction/ URL with encoded params', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200);
    }) as unknown as typeof fetch;

    const svc = new JetsonService({ baseUrl: 'http://192.168.1.100:8000/', fetchImpl });
    const result = await svc.startTransaction({
      transId: 'IS-42',
      type: 'Before Wash',
      operatorName: 'Jane Doe',
      uniqId: 'abc-123',
      date: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
    const parsed = new URL(calls[0].url);
    expect(parsed.pathname).toBe('/transaction/');
    expect(parsed.searchParams.get('id')).toBe('IS-42');
    expect(parsed.searchParams.get('type')).toBe('Before Wash');
    expect(parsed.searchParams.get('operator_name')).toBe('Jane Doe');
    expect(parsed.searchParams.get('uniq_id')).toBe('abc-123');
  });

  it('startTransaction throws TransactionConflictError on HTTP 409', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409)) as unknown as typeof fetch;
    const svc = new JetsonService({ baseUrl: 'http://jetson', fetchImpl });
    await expect(
      svc.startTransaction({
        transId: 'T1',
        type: 'After Wash',
        operatorName: 'op',
        uniqId: 'u1',
        date: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(TransactionConflictError);
  });

  it('stopTransaction POSTs a form body with status=0 and uniq_id', async () => {
    let capturedBody: URLSearchParams | null = null;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as URLSearchParams;
      return jsonResponse(200);
    }) as unknown as typeof fetch;

    const svc = new JetsonService({ baseUrl: 'http://jetson', fetchImpl });
    await svc.stopTransaction({ uniqId: 'u1' });

    expect(capturedBody).not.toBeNull();
    expect((capturedBody as unknown as URLSearchParams).get('status')).toBe('0');
    expect((capturedBody as unknown as URLSearchParams).get('uniq_id')).toBe('u1');
  });
});
