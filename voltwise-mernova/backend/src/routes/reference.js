import { Router } from 'express';
import {
  CONDUCTORS,
  LOAD_CATEGORIES,
  STANDARD_BREAKER_A,
  STANDARD_CAPACITOR_KVAR,
  COPPER_XLPE_ARMOURED_AIR,
  DEFAULT_SETTINGS,
  STANDARD_TRANSFORMER_KVA,
  cableSizes,
} from '@voltwise/engine';

export const referenceRouter = Router();

referenceRouter.get('/', (req, res) => {
  res.json({
    cableTable: cableSizes().map((size) => ({
      sizeSqmm: size,
      ...COPPER_XLPE_ARMOURED_AIR[size],
    })),
    cableTables: Object.fromEntries(Object.entries(CONDUCTORS).map(([key, c]) => [key, {
      label: c.label,
      k: c.k,
      sizes: cableSizes(c.table).map((size) => ({ sizeSqmm: size, ...c.table[size] })),
    }])),
    categories: Object.entries(LOAD_CATEGORIES).map(([key, c]) => ({ key, label: c.label, profile: c.profile })),
    breakerRatings: STANDARD_BREAKER_A,
    capacitorRatings: STANDARD_CAPACITOR_KVAR,
    transformerRatings: STANDARD_TRANSFORMER_KVA,
    defaultSettings: DEFAULT_SETTINGS,
    disclaimer:
      'Cable data is indicative for 1.1 kV copper XLPE armoured cables in air at ~40 degC. ' +
      'Use the manufacturer datasheet and IS 3961 / IEC 60364-5-52 for a real design.',
  });
});
