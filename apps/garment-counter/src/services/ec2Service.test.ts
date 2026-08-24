import { EC2Service } from './ec2Service';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const rawCloth = {
  cloth_id: 7,
  cloth_type: 'shirts',
  file_path: '/img/7.jpg',
  date: '2026-01-01T00:00:00.000Z',
  ismodified: false,
  wash_type: 'Before Wash',
  trans_id: 'T1',
  operator_name: 'op',
  uniq_id: 'u1',
  status: 'ok',
};

describe('EC2Service', () => {
  it('getLatestCloth normalizes the raw payload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, rawCloth)) as unknown as typeof fetch;
    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    const event = await svc.getLatestCloth();
    expect(event?.clothId).toBe(7);
    expect(event?.clothType).toBe('shirts');
    expect(event?.washType).toBe('Before Wash');
  });

  it('getLatestCloth returns null for a malformed payload', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { cloth_id: 1 }),
    ) as unknown as typeof fetch;
    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    expect(await svc.getLatestCloth()).toBeNull();
  });

  it('correctCloth POSTs { cloth_id, category } to /single_cloth/', async () => {
    let body: unknown;
    let url = '';
    const fetchImpl = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u);
      body = JSON.parse(init?.body as string);
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    await svc.correctCloth({ clothId: 5, category: 'pants' });
    expect(url).toBe('http://ec2:8000/single_cloth/');
    expect(body).toEqual({ cloth_id: 5, category: 'pants' });
  });

  it('moveCloth POSTs the target payload and maps mismatch_resolved/new_status', async () => {
    let body: unknown;
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return jsonResponse(200, { mismatch_resolved: true, new_status: 'balanced' });
    }) as unknown as typeof fetch;

    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    const result = await svc.moveCloth({ clothId: 9, targetCategory: 'towels', transId: 'T1' });
    expect(body).toEqual({ cloth_id: 9, target_category: 'towels', trans_id: 'T1' });
    expect(result.mismatchResolved).toBe(true);
    expect(result.newStatus).toBe('balanced');
  });

  it('getTransactionItems normalizes rows and drops malformed entries', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [rawCloth, { cloth_id: 2 }, { ...rawCloth, cloth_id: 8 }]),
    ) as unknown as typeof fetch;
    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    const items = await svc.getTransactionItems('u1');
    expect(items.map((i) => i.clothId)).toEqual([7, 8]);
  });

  it('checkBeforeWash reports existence from either response shape', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { before_wash_exists: true }),
    ) as unknown as typeof fetch;
    const svc = new EC2Service({ baseUrl: 'http://ec2:8000', fetchImpl });
    expect((await svc.checkBeforeWash('T1')).exists).toBe(true);
  });
});
