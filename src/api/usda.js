import { supabase } from '@/api/supabaseClient';

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/usda-proxy`;

async function callProxy(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'USDA request failed');
  }
  return res.json();
}

function mapFood(food) {
  const nutrients = food.foodNutrients || [];

  const findByNumber = (...codes) => {
    for (const code of codes) {
      const n = nutrients.find((n) => n.nutrientNumber === String(code) || n.number === String(code));
      if (n && (n.value ?? n.amount) != null) return n.value ?? n.amount;
    }
    return 0;
  };

  const findByName = (name) => {
    const n = nutrients.find((n) =>
      (n.nutrientName || n.nutrient?.name || '').toLowerCase().includes(name.toLowerCase())
    );
    return n?.value ?? n?.amount ?? 0;
  };

  const calories = findByNumber(208, 957) || findByName('energy');
  const protein  = findByNumber(203)      || findByName('protein');
  const carbs    = findByNumber(205)      || findByName('carbohydrate');
  const fats     = findByNumber(204)      || findByName('total lipid') || findByName('fat');

  return {
    fdcId: food.fdcId,
    description: food.description,
    brandOwner: food.brandOwner || null,
    dataType: food.dataType || 'Branded',
    servingSize: food.servingSize || 100,
    servingSizeUnit: food.servingSizeUnit || 'g',
    calories,
    protein,
    carbs,
    fats,
  };
}

export async function searchGenericFoods(query, pageSize = 10) {
  if (!query || query.length < 2) return [];
  const data = await callProxy({ action: 'search', query, pageSize, dataType: 'Foundation,SR Legacy' });
  return (data.foods || []).map(mapFood);
}

export async function searchBrandedFoods(query, pageSize = 10) {
  if (!query || query.length < 2) return [];
  const data = await callProxy({ action: 'search', query, pageSize, dataType: 'Branded' });
  return (data.foods || []).map(mapFood);
}

export async function searchFoods(query, pageSize = 10) {
  return searchGenericFoods(query, pageSize);
}

export async function lookupByGtin(barcode) {
  if (!barcode) return null;
  const data = await callProxy({ action: 'search', query: barcode, dataType: 'Branded', pageSize: 5 });
  const match = (data.foods || []).find(
    (f) => f.gtinUpc === barcode || f.gtinUpc === barcode.replace(/^0+/, '')
  );
  return match ? mapFood(match) : null;
}

export async function getFoodDetails(fdcId) {
  const data = await callProxy({ action: 'detail', fdcId });
  return mapFood(data);
}
