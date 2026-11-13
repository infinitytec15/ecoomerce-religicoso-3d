const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const formatRating = (value: number) => nf.format(value);
export const reviewCountLabel = (count: number) =>
  `${count} ${count === 1 ? 'avaliação' : 'avaliações'}`;
export function RatingStars({
  value,
  count,
  size = 16,
}: {
  value: number;
  count?: number;
  size?: number;
}) {
  const label =
    `Nota ${formatRating(value)} de 5` +
    (count === undefined ? '' : ` (${reviewCountLabel(count)})`);
  return (
    <span className="rating-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={Math.round(value) >= n ? 'on' : 'off'}
        >
          <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />
        </svg>
      ))}
    </span>
  );
}
