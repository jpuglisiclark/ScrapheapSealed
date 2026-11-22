import { CURVE_LABELS } from '../../../shared/cards.ts';

/**
 * Mana curve as vertical bars. `creatures` (optional) is drawn as the lower segment of each bar.
 * Pass a shared `max` when several curves sit side by side so they're comparable.
 */
export function Curve({ curve, creatures, max, height = 72 }: { curve: number[]; creatures?: number[]; max?: number; height?: number }) {
  const top = Math.max(max ?? 0, ...curve, 1);
  return (
    <div className="curve" style={{ height: height + 18 }} role="img" aria-label={`Mana curve: ${curve.map((n, i) => `${CURVE_LABELS[i]}: ${n}`).join(', ')}`}>
      {curve.map((n, i) => {
        const cr = creatures?.[i] ?? 0;
        const tip = creatures ? `${CURVE_LABELS[i]} mana: ${n} spells (${cr} creatures, ${n - cr} other)` : `${CURVE_LABELS[i]} mana: ${n}`;
        return (
          <div className="curve-col" key={i} title={tip}>
            <span className="curve-n">{n || ''}</span>
            <div className="curve-bar" style={{ height: (n / top) * height }}>
              {creatures && n - cr > 0 && <div className="seg other" style={{ flex: n - cr }} />}
              {creatures && cr > 0 && <div className="seg creature" style={{ flex: cr }} />}
              {!creatures && n > 0 && <div className="seg creature" style={{ flex: 1 }} />}
            </div>
            <span className="curve-label">{CURVE_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CurveLegend() {
  return (
    <div className="legend">
      <span><i className="sw creature" /> Creatures</span>
      <span><i className="sw other" /> Other spells</span>
    </div>
  );
}
