import { clickRate, type AdminStoryVideo } from '@maos-em-oracao/contracts';
import { money } from '@/lib/domain/format';

const COUNTERS = [
  'impressions',
  'views',
  'completes',
  'clicks',
  'carts',
  'orders',
  'revenueCents',
] as const;
export type StoryCounters = Pick<AdminStoryVideo, (typeof COUNTERS)[number]>;

/** Sum of the usage and sales counters of the videos; a missing counter (older snapshot) is 0. */
export function sumCounters(videos: Partial<StoryCounters>[]): StoryCounters {
  const total = Object.fromEntries(COUNTERS.map((k) => [k, 0])) as StoryCounters;
  return videos.reduce<StoryCounters>(
    (sum, v) => Object.fromEntries(COUNTERS.map((k) => [k, sum[k] + (v[k] ?? 0)])) as StoryCounters,
    total,
  );
}

const count = (n: number) => n.toLocaleString('pt-BR');

/** The video commerce numbers, in funnel order: seen, watched, clicked, bagged, bought. */
export function storyMetricItems(
  c: StoryCounters,
): { label: string; value: string; note: string }[] {
  return [
    {
      label: 'Impressões',
      value: count(c.impressions),
      note: 'Vezes que o vídeo apareceu na tela',
    },
    { label: 'Visualizações', value: count(c.views), note: 'Vídeos que começaram a tocar' },
    {
      label: 'Assistidos até o fim',
      value: count(c.completes),
      note: 'Visualizações completas',
    },
    { label: 'Cliques em produto', value: count(c.clicks), note: 'Toques em “Ver peça”' },
    {
      label: 'Taxa de clique',
      value: clickRate(c.views, c.clicks),
      note: 'Cliques em produto por visualização',
    },
    { label: 'Sacola', value: count(c.carts), note: 'Peças colocadas na sacola pelo vídeo' },
    { label: 'Pedidos', value: count(c.orders), note: 'Pedidos pagos com peça do vídeo' },
    { label: 'Receita', value: money(c.revenueCents), note: 'Valor das peças vendidas pelo vídeo' },
  ];
}

/** One video's numbers as a compact wrapping line for the videos panel. */
export function VideoMetrics({ video }: { video: Partial<StoryCounters> }) {
  return (
    <small className="row wrap">
      {storyMetricItems(sumCounters([video])).map((item) => (
        <span key={item.label}>
          {item.label} <strong>{item.value}</strong>
        </span>
      ))}
    </small>
  );
}
