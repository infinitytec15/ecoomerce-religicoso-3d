'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="group-share">
      <a
        className="btn secondary small"
        href={'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Compartilhar no WhatsApp
      </a>
      <button type="button" className="btn secondary small" onClick={copy}>
        {copied ? (
          <>
            <Icon name="check" /> Link copiado
          </>
        ) : (
          'Copiar link'
        )}
      </button>
    </div>
  );
}
