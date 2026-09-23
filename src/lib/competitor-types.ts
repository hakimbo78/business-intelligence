/**
 * Finding the competitors that are actually there.
 *
 * The first version of this searched with `includedType: 'store'` for every
 * business alike. A laundry in Google's taxonomy is `laundry`, not `store`, so
 * strict type filtering discarded every one of them: a Depok laundry with
 * twenty competitors inside 1.5 km was reported as a market with one competitor
 * 2.3 km away, and scored 85/100 for low competition.
 *
 * A wrong count in this direction is the worst failure the product can have —
 * it tells someone to open where the market is already full. So the categories
 * are resolved to real Google types here, deterministically, and the density
 * that follows from the count is computed rather than asked of a model.
 *
 * Every type in the table below was verified against the live Places API; the
 * plausible-looking `dry_cleaner`, `print_shop` and `photo_lab` do not exist and
 * are deliberately absent.
 */

/** Keyword in the business category, and the Google Places types to search. */
const CATEGORY_TYPES: Array<{ match: RegExp; types: string[] }> = [
  { match: /laundry|londri|cuci\s*(pakaian|baju|kiloan)|dry\s*clean/i, types: ['laundry'] },
  { match: /cuci\s*(mobil|motor)|car\s*wash|steam/i, types: ['car_wash'] },
  { match: /bengkel|servis\s*(mobil|motor)|workshop|car\s*repair/i, types: ['car_repair'] },
  { match: /kopi|coffee|kafe|cafe/i, types: ['cafe', 'coffee_shop'] },
  { match: /roti|bakery|kue|pastry|cake/i, types: ['bakery', 'dessert_shop'] },
  { match: /es\s*krim|ice\s*cream|gelato/i, types: ['ice_cream_shop', 'dessert_shop'] },
  { match: /jus|juice|minuman|boba|milk\s*tea/i, types: ['juice_shop', 'cafe'] },
  {
    match: /warung|rumah\s*makan|resto|restoran|restaurant|katering|catering|makanan|kuliner/i,
    types: ['restaurant', 'meal_takeaway', 'fast_food_restaurant', 'food_court'],
  },
  { match: /pangkas|barber|cukur/i, types: ['barber_shop', 'hair_salon'] },
  { match: /salon|kecantikan|beauty|nail|kuku/i, types: ['beauty_salon', 'hair_salon', 'nail_salon'] },
  { match: /apotek|apotik|pharmacy|obat/i, types: ['pharmacy', 'drugstore'] },
  {
    match: /minimarket|kelontong|sembako|toko\s*serba|convenience/i,
    types: ['convenience_store', 'grocery_store'],
  },
  { match: /supermarket|swalayan/i, types: ['supermarket', 'grocery_store'] },
  { match: /gym|fitness|kebugaran|sasana/i, types: ['gym', 'fitness_center'] },
  { match: /kost|kos|hotel|penginapan|guest\s*house/i, types: ['hotel'] },
  { match: /baju|pakaian|butik|clothing|fashion|distro/i, types: ['clothing_store'] },
  { match: /sepatu|shoe/i, types: ['shoe_store'] },
  { match: /penjahit|tailor|konveksi/i, types: ['tailor'] },
  { match: /konter|pulsa|handphone|cell\s*phone|gadget/i, types: ['cell_phone_store'] },
  { match: /elektronik|electronic/i, types: ['electronics_store'] },
  { match: /bangunan|material|hardware|besi/i, types: ['hardware_store'] },
  { match: /bunga|florist/i, types: ['florist'] },
  { match: /hewan|pet\s*shop|petshop/i, types: ['pet_store', 'veterinary_care'] },
  { match: /mebel|furnitur|furniture/i, types: ['furniture_store'] },
  { match: /buku|book|atk|alat\s*tulis/i, types: ['book_store'] },
  {
    match: /daycare|penitipan\s*anak|paud|playgroup|preschool/i,
    types: ['child_care_agency', 'preschool'],
  },
  { match: /bensin|pom|spbu|gas\s*station/i, types: ['gas_station'] },
];

/**
 * Google types to search for a business category.
 *
 * Returns an empty list when nothing matches, which the caller must treat as
 * "we cannot search reliably for this business" rather than falling back to a
 * broad type. A broad type is what produced the failure this module exists to
 * prevent.
 */
export function resolveCompetitorTypes(categories: string[]): string[] {
  const types = new Set<string>();

  for (const category of categories) {
    for (const entry of CATEGORY_TYPES) {
      if (entry.match.test(category)) {
        entry.types.forEach((t) => types.add(t));
      }
    }
  }

  return [...types];
}

export type CompetitionDensity = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface CompetitionCount {
  found: number;
  /**
   * True when the provider returned its maximum.
   *
   * This is the most useful fact the search produces: it means the real number
   * is "at least this many, we stopped counting", which is saturation.
   */
  capped: boolean;
  radiusMeters: number;
  /** Distance to the closest one, which decides whether they matter. */
  nearestMeters: number | null;
  /** Whether the business category could be searched at all. */
  searchable: boolean;
}

/** Enough competitors inside the radius to call the market crowded. */
const HIGH_DENSITY_COUNT = 10;
const MEDIUM_DENSITY_COUNT = 4;

/**
 * Density from the count, not from a model's impression of a list.
 *
 * Deterministic because it drives a score, which drives a recommendation
 * (DEVELOPMENT_RULES.md §13).
 */
export function densityFromCount(count: CompetitionCount): CompetitionDensity {
  if (!count.searchable) return 'UNKNOWN';
  if (count.capped || count.found >= HIGH_DENSITY_COUNT) return 'HIGH';
  if (count.found >= MEDIUM_DENSITY_COUNT) return 'MEDIUM';
  return 'LOW';
}

/** What the count means, in the customer's language. */
export function describeCompetition(count: CompetitionCount): string {
  const km = (count.radiusMeters / 1000).toFixed(1).replace('.', ',');

  if (!count.searchable) {
    return (
      'Jenis usaha Anda tidak dapat dicocokkan dengan kategori resmi Google Maps, sehingga ' +
      'jumlah pesaing TIDAK kami ukur. Angka persaingan di laporan ini tidak dapat dipakai — ' +
      'hitung sendiri di lapangan.'
    );
  }

  if (count.found === 0) {
    return (
      `Tidak ditemukan satu pun usaha sejenis dalam radius ${km} km. Ini bisa berarti peluang, ` +
      'tetapi bisa juga berarti usaha seperti ini memang tidak bertahan di sini — atau tidak ' +
      'terdaftar di Google Maps. Periksa langsung sebelum menyimpulkan.'
    );
  }

  if (count.capped) {
    return (
      `Kami menemukan ${count.found} usaha sejenis dalam radius ${km} km, dan itu adalah BATAS ` +
      'maksimal hasil pencarian Google — jumlah sebenarnya lebih banyak lagi. Pasar di sini ' +
      'sudah padat.' +
      (count.nearestMeters !== null
        ? ` Yang terdekat hanya ${count.nearestMeters} m dari properti.`
        : '')
    );
  }

  return (
    `Ditemukan ${count.found} usaha sejenis dalam radius ${km} km` +
    (count.nearestMeters !== null ? `, yang terdekat ${count.nearestMeters} m` : '') +
    '. Ini yang terdaftar di Google Maps; usaha rumahan yang tidak terdaftar tidak terhitung.'
  );
}
