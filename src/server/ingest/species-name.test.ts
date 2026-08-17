import { describe, expect, it } from 'vitest';
import { parseSpeciesLabel } from './species-name';

describe('parseSpeciesLabel', () => {
  it('laisse un nom simple intact', () => {
    expect(parseSpeciesLabel('Groudon')).toEqual({
      baseName: 'Groudon',
      forms: [],
      shadow: false,
    });
  });

  it('sort la forme régionale du préfixe, ponctuation comprise', () => {
    expect(parseSpeciesLabel('Galarian Mr. Mime')).toEqual({
      baseName: 'Mr. Mime',
      forms: ['Galarian'],
      shadow: false,
    });
  });

  it('reconnaît les Méga et leurs variantes X / Y', () => {
    expect(parseSpeciesLabel('Mega Garchomp').forms).toEqual(['Mega']);
    expect(parseSpeciesLabel('Mega Charizard Y')).toEqual({
      baseName: 'Charizard',
      forms: ['Mega Y'],
      shadow: false,
    });
  });

  it('reconnaît les Primo-', () => {
    expect(parseSpeciesLabel('Primal Kyogre')).toEqual({
      baseName: 'Kyogre',
      forms: ['Primal'],
      shadow: false,
    });
  });

  it('cumule le préfixe obscur et la forme entre parenthèses', () => {
    expect(parseSpeciesLabel('Shadow Giratina (Altered)')).toEqual({
      baseName: 'Giratina',
      forms: ['Altered'],
      shadow: true,
    });
  });

  it('combine préfixe et parenthèses de la plus précise à la plus large', () => {
    expect(parseSpeciesLabel('Galarian Darmanitan (Zen)')).toEqual({
      baseName: 'Darmanitan',
      forms: ['Galarian Zen', 'Galarian', 'Zen'],
      shadow: false,
    });
  });
});
