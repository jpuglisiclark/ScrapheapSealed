import type { PoolCard } from '../../../shared/types.ts';
import { TextCard, usePreview } from './Preview.tsx';

interface Props {
  card: PoolCard;
  onClick?: (e: React.MouseEvent) => void;
  label?: string;
  badge?: React.ReactNode;
  dim?: boolean;
  /** Starts a drag (handled by the builder with pointer events). */
  onDragPointerDown?: (e: React.PointerEvent) => void;
  dragging?: boolean;
  selected?: boolean;
  /** All card ids this tile stands for (a stack of identical basics). */
  group?: string[];
}

/** A single card image (with text fallback) that shows the large preview on hover. */
export function CardTile({ card, onClick, label, badge, dim, onDragPointerDown, dragging, selected, group }: Props) {
  const { show, hide } = usePreview();
  const inner = card.image ? (
    <img src={card.image} alt={card.name} loading="lazy" draggable={false} />
  ) : (
    <TextCard card={card} />
  );
  const cls = `card-tile rarity-${card.rarity} ${card.foil ? 'foil' : ''} ${dim ? 'dim' : ''} ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${onDragPointerDown ? 'can-drag' : ''}`;
  const common = {
    className: cls,
    'data-uid': card.uid,
    'data-name': card.name,
    'data-group': group && group.length > 1 ? group.join(',') : undefined,
    onPointerEnter: (e: React.PointerEvent) => show(card, e),
    onPointerMove: (e: React.PointerEvent) => show(card, e),
    onPointerLeave: hide,
    onPointerDown: onDragPointerDown,
  };
  return onClick ? (
    <button
      type="button"
      aria-label={label ?? card.name}
      draggable={false}
      onClick={(e) => {
        hide();
        onClick(e);
      }}
      {...common}
    >
      {inner}
      {badge}
    </button>
  ) : (
    <div {...common}>
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
