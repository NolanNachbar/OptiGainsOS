import { lookupByGtin } from './usda';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,product_name_en,brands,nutriments,serving_size';

function parseServingGrams(servingStr) {
  if (!servingStr) return null;
  // Match the first number followed by 'g', e.g. "30g", "1 serving (240g)", "240 g"
  const match = servingStr.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

function mapOffProduct(product) {
  const n = product.nutriments || {};

  // OFF stores values per 100g with _100g suffix; fall back to per-serving if needed
  const calories =
    n['energy-kcal_100g'] ??
    (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null) ??
    n['energy-kcal'] ?? 0;

  const protein = n['proteins_100g'] ?? n['proteins'] ?? 0;
  const carbs   = n['carbohydrates_100g'] ?? n['carbohydrates'] ?? 0;
  const fats    = n['fat_100g'] ?? n['fat'] ?? 0;

  // Reject products with completely missing nutrition data
  if (calories === 0 && protein === 0 && carbs === 0 && fats === 0) return null;

  const servingG = parseServingGrams(product.serving_size) ?? 100;
  const name = product.product_name_en || product.product_name || 'Unknown product';

  return {
    fdcId: null,
    description: name,
    brandOwner: product.brands || null,
    dataType: 'Barcode',
    servingSize: servingG,
    servingSizeUnit: 'g',
    calories: Math.round(calories * 10) / 10,
    protein:  Math.round(protein  * 10) / 10,
    carbs:    Math.round(carbs    * 10) / 10,
    fats:     Math.round(fats     * 10) / 10,
  };
}

export async function lookupBarcode(barcode) {
  // Try Open Food Facts first
  try {
    const url = `${OFF_BASE}/${barcode}.json?fields=${FIELDS}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const food = mapOffProduct(data.product);
        if (food) return food;
      }
    }
  } catch {}

  // Fall back to USDA branded foods database (better coverage for US products)
  try {
    return await lookupByGtin(barcode);
  } catch {}

  return null;
}
