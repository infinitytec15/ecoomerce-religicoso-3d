import { describe, it, expect } from 'vitest';
import { productModelSchema } from './admin-schemas';
import { httpsUrlSchema } from './urls';
const model = { assetId: 'fixture', filename: 'peca.stl', format: 'stl', status: 'ready' };
describe('URLs publicadas pela API', () => {
  it('aceita previews locais derivados e HTTPS sem lançar erro na união', () => {
    for (const previewUrl of [
      '/api/media/public/fixture/preview.glb',
      'https://cdn.example.test/models/fixture.glb',
    ])
      expect(productModelSchema.safeParse({ ...model, previewUrl }).success).toBe(true);
  });
  it('recusa destinos inseguros e caminhos privados de forma validável', () => {
    for (const previewUrl of [
      'javascript:alert(1)',
      'http://external.example.test/file.glb',
      'https://user:secret@external.example.test/file.glb',
      '/api/v1/admin/media/fixture/original',
      '/api/media/public/../original',
      'not-a-url',
    ]) {
      expect(productModelSchema.safeParse({ ...model, previewUrl }).success).toBe(false);
      expect(httpsUrlSchema.safeParse(previewUrl).success).toBe(false);
    }
  });
});
