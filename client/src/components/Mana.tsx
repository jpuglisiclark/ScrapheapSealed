import type { Color } from '../../../shared/types.ts';
import { COLOR_NAMES } from '../../../shared/types.ts';

const PIP_CLASS: Record<string, string> = { W: 'W', U: 'U', B: 'B', R: 'R', G: 'G', C: 'C' };

/** Renders "{2}{W}{U/B}" as small symbol pips. */
export function ManaCost({ cost }: { cost: string }) {
  const front = cost.split('//')[0];
  const syms = [...front.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!syms.length) return null;
  return (
    <span className="mana-cost" aria-label={front}>
      {syms.map((s, i) => {
        const parts = s.split('/');
        const cls = parts.length > 1 ? `hybrid ${parts.map((p) => PIP_CLASS[p] ?? '').join('')}` : PIP_CLASS[s] ?? 'generic';
        return (
          <span key={i} className={`pip ${cls}`}>
            {PIP_CLASS[s] ? '' : parts.length > 1 ? '' : s}
          </span>
        );
      })}
    </span>
  );
}

export function ColorDots({ colors, splash = [] }: { colors: Color[]; splash?: Color[] }) {
  return (
    <span className="color-dots">
      {colors.map((c) => (
        <span key={c} className={`pip ${c}`} title={COLOR_NAMES[c]} />
      ))}
      {splash.map((c) => (
        <span key={c} className={`pip ${c} splash`} title={`${COLOR_NAMES[c]} (splash)`} />
      ))}
    </span>
  );
}
