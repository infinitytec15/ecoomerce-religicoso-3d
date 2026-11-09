'use client';
import { useUiStore } from '@/lib/store/ui';
import { Icon } from '@/components/ui/icon';
export function PrayerInvite() {
  const open = useUiStore((s) => s.setNewsletterOpen);
  return (
    <button className="prayer-invite" onClick={() => open(true)}>
      <Icon name="mail" />
      Receber uma oração diária <Icon name="arrow" />
    </button>
  );
}
