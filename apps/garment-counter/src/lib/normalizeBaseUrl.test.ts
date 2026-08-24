import { normalizeBaseUrl } from './jetsonUrl';

describe('normalizeBaseUrl', () => {
  it('prepends http:// when no scheme is present', () => {
    expect(normalizeBaseUrl('localhost:4000')).toBe('http://localhost:4000');
    expect(normalizeBaseUrl('192.168.1.100:8000')).toBe('http://192.168.1.100:8000');
  });

  it('preserves an existing http/https scheme', () => {
    expect(normalizeBaseUrl('http://localhost:4000')).toBe('http://localhost:4000');
    expect(normalizeBaseUrl('https://ec2.example.com')).toBe('https://ec2.example.com');
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:4000/  ')).toBe('http://localhost:4000');
    expect(normalizeBaseUrl('localhost:4000///')).toBe('http://localhost:4000');
  });

  it('leaves an empty string empty', () => {
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl('   ')).toBe('');
  });
});
