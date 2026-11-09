import { Icon } from './icon';
export function Steps({ items, current }: { items: string[]; current: number }) {
  return (
    <ol className="steps" aria-label="Etapas">
      {items.map((item, i) => (
        <li
          key={item}
          className={i === current ? 'active' : i < current ? 'done' : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          <b>{i < current ? <Icon name="check" /> : i + 1}</b>
          {item}
        </li>
      ))}
    </ol>
  );
}
