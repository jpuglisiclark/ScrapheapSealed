import type { CardTemplate, Color, Rarity } from '../shared/types.ts';

let n = 0;
export function card(partial: Partial<CardTemplate> & { name: string }): CardTemplate {
  n++;
  return {
    scryfallId: `id-${n}`,
    manaCost: '{1}',
    cmc: 1,
    colors: [],
    colorIdentity: [],
    typeLine: 'Creature — Test',
    rarity: 'common',
    oracleText: '',
    producedMana: [],
    image: null,
    imageBack: null,
    collectorNumber: String(n),
    ...partial,
  };
}

/** A fake set: 60 commons, 30 uncommons, 15 rares, 5 mythics, 3 common lands across five colors. */
export function fakeSet(): CardTemplate[] {
  const cols: Color[] = ['W', 'U', 'B', 'R', 'G'];
  const out: CardTemplate[] = [];
  const add = (rarity: Rarity, count: number) => {
    for (let i = 0; i < count; i++) {
      const c = cols[i % 5];
      const cmc = (i % 6) + 1;
      out.push(card({ name: `${rarity} ${c} ${i}`, rarity, colors: [c], manaCost: `{${cmc - 1}}{${c}}`, cmc, typeLine: i % 3 ? 'Creature — Bear' : 'Instant' }));
    }
  };
  add('common', 60);
  add('uncommon', 30);
  add('rare', 15);
  add('mythic', 5);
  for (let i = 0; i < 3; i++) out.push(card({ name: `Common Land ${i}`, typeLine: 'Land', manaCost: '', cmc: 0 }));
  out.push(card({ name: 'Plains', typeLine: 'Basic Land — Plains', manaCost: '', cmc: 0 }));
  return out;
}
