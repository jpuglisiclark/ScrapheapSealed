import type { PoolCard } from '../../../shared/types.ts';
import { TextCard, usePreview } from './Preview.tsx';

interface Props {
  card: PoolCard;
  onClick?: () => void;
  label?: string;
  badge?: React.ReactNode;
  dim?: boolean;
}

/** A single card image (with text fallback) that shows the large preview on hover. */
export function CardTile({ card, onClick, label, badge, dim }: Props) {
  const { show, hide } = usePreview();
  const inner = card.image ? (
    <img src={card.image} alt={card.name} loading="lazy" draggable={false} />
  ) : (
    <TextCard card={card} />
  );
  const cls = `card-tile rarity-${card.rarity} ${card.foil ? 'foil' : ''} ${dim ? 'dim' : ''}`;
  const events = {
    onPointerEnter: (e: React.PointerEvent) => show(card, e),
    onPointerMove: (e: React.PointerEvent) => show(card, e),
    onPointerLeave: hide,
  };
  return onClick ? (
    <button
      type="button"
      className={cls}
      title={label ?? card.name}
      aria-label={label ?? card.name}
      onClick={() => {
        hide();
        onClick();
      }}
      {...events}
    >
      {inner}
      {badge}
    </button>
  ) : (
    <div className={cls} title={card.name} {...events}>
      {inner}
      {badge}
    </div>
  );
}

/** Inline card name that previews on hover; used in lists and tables. */
export function CardName({ card, children }: { card: PoolCard; children?: React.ReactNode }) {
  const { show, hide } = usePreview();
  return (
    <span className="card-name" onPointerEnter={(e) => show(card, e)} onPointerMove={(e) => show(card, e)} onPointerLeave={hide}>
      {children ?? card.name}
    </span>
  );
}
