import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductEditor } from './product-editor';
import { ProductGallery, videoReference } from '@/features/catalog/product-media';
import { createSeed } from '@/lib/demo/seed';
const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', () => ({ useAdminAction: () => ({ run }) }));
describe('product publishing and media controls', () => {
  it('requires an image before publishing and removes the previous cover when saved as a draft', async () => {
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Mídia da vitrine' }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Adicione uma imagem');
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Produto' }));
    await user.selectOptions(screen.getByLabelText('Visibilidade'), 'false');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'product.save',
          product: expect.objectContaining({
            active: false,
            media: [],
            image: '/assets/products/placeholder.svg',
          }),
        }),
      ),
    );
  });
  it('shows the 3D action only when the product has an uploaded ready model', () => {
    const p = createSeed().products[0],
      open = vi.fn();
    const { rerender } = render(<ProductGallery product={p} onView3D={open} />);
    expect(screen.queryByRole('button', { name: /Ver peça em 3D/ })).not.toBeInTheDocument();
    rerender(
      <ProductGallery
        product={{
          ...p,
          model: { assetId: 'uploaded-file', filename: 'peca.stl', format: 'stl', status: 'ready' },
        }}
        onView3D={open}
      />,
    );
    expect(screen.getByRole('button', { name: /Ver peça em 3D/ })).toBeInTheDocument();
  });
  it('canonicalizes supported videos and rejects active or unrelated URLs', () => {
    expect(videoReference('https://youtu.be/aqz-KE-bpKQ').url).toBe(
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    );
    expect(videoReference('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ').source).toBe(
      'youtube',
    );
    expect(() => videoReference('javascript:alert(1)')).toThrow();
    expect(() => videoReference('https://youtube.com.attacker.test/watch?v=aqz-KE-bpKQ')).toThrow();
  });
});
