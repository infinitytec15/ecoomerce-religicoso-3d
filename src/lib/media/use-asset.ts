'use client';
import { useEffect, useState } from 'react';
import { loadAsset } from './assets';
export function useAssetUrl(source?: string) {
  const [resolved, setResolved] = useState<{ source: string; url: string }>();
  useEffect(() => {
    if (!source?.startsWith('asset:')) return;
    let active = true,
      url: string | undefined;
    void loadAsset(source.slice(6))
      .then((asset) => {
        if (active) {
          url = URL.createObjectURL(asset.blob);
          setResolved({ source, url });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);
  return source?.startsWith('asset:')
    ? resolved?.source === source
      ? resolved.url
      : undefined
    : source;
}
