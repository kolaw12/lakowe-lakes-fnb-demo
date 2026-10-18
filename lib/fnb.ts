export type OrderStatus = "received" | "preparing" | "ready" | "completed";
export type ModifierChoice = { id: string; name: string; price: number };
export const HANDOFF_MODES = ["counter", "table", "room", "golf_course"] as const;
export type HandoffMode = typeof HANDOFF_MODES[number];

export interface Outlet {
  id: string;
  name: string;
  type: string;
  description: string;
  image: string;
  open: string;
  accent: string;
}

export interface MenuItem {
  id: string;
  outletId: string;
  category: string;
  name: string;
  description: string;
  price: number;
  image: string;
  modifiers?: { id: string; name: string; required?: boolean; choices: ModifierChoice[] }[];
  prepTime?: string;
  tags?: string[];
  pairing?: string;
  chefNote?: string;
}

export interface CartItem {
  key: string;
  itemId: string;
  quantity: number;
  choices: ModifierChoice[];
}

export interface DemoOrder {
  reference: string;
  customerName: string;
  createdAt: string;
  status: OrderStatus;
  outletId: string;
  items: CartItem[];
  paymentMethod: "demo" | "wallet_demo" | "opera_demo";
  subtotal: number;
  total: number;
  verification?: { token: string; collectionCode?: string; handoffMode: string; expiresAt: string };
}

export const outlets: Outlet[] = [
  { id: "winebar", name: "Winebar", type: "Wine & small plates", description: "Curated pours and lake-view sharing plates.", image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80", open: "12:00–22:00", accent: "#8c4d50" },
  { id: "revivo", name: "Revivo", type: "Wellness kitchen", description: "Bright, nourishing plates made to restore.", image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80", open: "08:00–19:00", accent: "#4f7a57" },
  { id: "clubhouse", name: "The Clubhouse", type: "All-day dining", description: "A relaxed table after a round on the course.", image: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80", open: "07:00–21:30", accent: "#8a6a36" },
  { id: "restaurant-18", name: "Restaurant on 18", type: "Signature dining", description: "An elevated evening at the eighteenth green.", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80", open: "18:00–23:00", accent: "#435d48" },
];

export const menuItems: MenuItem[] = [
  {
    id: "club-burger",
    outletId: "clubhouse",
    category: "Mains",
    name: "Lakowe Club Burger",
    description: "Chargrilled beef, aged cheddar, tomato relish and hand-cut fries.",
    price: 1450000,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
    prepTime: "15–20 mins",
    tags: ["Resort Classic", "Chargrilled"],
    pairing: "Malt & Ginger Cooler",
    chefNote: "Dry-aged prime beef patty ground fresh in-house, seared over open hardwood coals and served on a toasted artisanal brioche bun.",
    modifiers: [
      { id: "cook", name: "How would you like it cooked?", required: true, choices: [{ id: "medium", name: "Medium", price: 0 }, { id: "well", name: "Well done", price: 0 }] },
      { id: "side", name: "Make it yours", choices: [{ id: "fries", name: "Extra fries", price: 250000 }, { id: "avocado", name: "Add avocado", price: 180000 }] }
    ]
  },
  {
    id: "jollof",
    outletId: "clubhouse",
    category: "Mains",
    name: "Smoky Jollof & Chicken",
    description: "Party-style jollof rice, grilled chicken supreme and plantain.",
    price: 1250000,
    image: "https://images.unsplash.com/photo-1664992960082-0ea299a9c53e?auto=format&fit=crop&w=900&q=80",
    prepTime: "20–25 mins",
    tags: ["Chef's Signature", "Local Specialty"],
    pairing: "Malt & Ginger Cooler",
    chefNote: "Slow-simmered long-grain rice steeped in fire-roasted plum tomatoes, scotch bonnet and sweet tatashe peppers, crowned with succulent grilled chicken skewers and sweet caramelized dodo."
  },
  {
    id: "caesar",
    outletId: "clubhouse",
    category: "Light bites",
    name: "Charred Caesar Salad",
    description: "Baby gem, parmesan, herb croutons and a soft-boiled egg.",
    price: 950000,
    image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=900&q=80",
    prepTime: "10–12 mins",
    tags: ["Light & Crisp", "Vegetarian"],
    pairing: "Côtes de Provence Rosé",
    chefNote: "Crisp organic baby gem lettuce gently charred, tossed with house garlic-parmesan emulsion, rustic sourdough croutons, and farm soft-boiled egg."
  },
  {
    id: "malt",
    outletId: "clubhouse",
    category: "Drinks",
    name: "Malt & Ginger Cooler",
    description: "House ginger cordial, lime and chilled malt.",
    price: 350000,
    image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80",
    prepTime: "5 mins",
    tags: ["House Mocktail", "Alcohol-Free"],
    pairing: "Lakowe Club Burger",
    chefNote: "Chilled Nigerian malt beverage elevated with freshly steeped house ginger cordial, fresh garden mint, and hand-squeezed lime wedges."
  },
  {
    id: "charcuterie",
    outletId: "winebar",
    category: "Small plates",
    name: "Lake House Charcuterie",
    description: "Cured meats, local cheese, fruit and sourdough.",
    price: 1800000,
    image: "https://images.unsplash.com/photo-1768179123196-c1b305663b5a?auto=format&fit=crop&w=900&q=80",
    prepTime: "10–15 mins",
    tags: ["Sharing Plate", "Artisanal"],
    pairing: "Côtes de Provence Rosé",
    chefNote: "Hand-sliced prosciutto and dry-cured salumi paired with artisanal farm cheeses, marinated olives, sweet table grapes, and warm hearth-baked sourdough."
  },
  {
    id: "prawns",
    outletId: "winebar",
    category: "Small plates",
    name: "Chilli Butter Prawns",
    description: "Tiger prawns, roasted garlic, chilli butter and grilled bread.",
    price: 1650000,
    image: "https://images.unsplash.com/photo-1625943553852-781c6dd46faa?auto=format&fit=crop&w=900&q=80",
    prepTime: "12–15 mins",
    tags: ["Fresh Catch", "Spicy Garlic"],
    pairing: "Côtes de Provence Rosé",
    chefNote: "Jumbo tiger prawns seared hot in browned butter infused with roasted garlic confit, crushed red chilies, fresh flat parsley, and charred sourdough for dipping."
  },
  {
    id: "rose",
    outletId: "winebar",
    category: "Wine by the glass",
    name: "Côtes de Provence Rosé",
    description: "Fresh berries, citrus and a clean mineral finish.",
    price: 720000,
    image: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&w=900&q=80",
    prepTime: "Chilled pour",
    tags: ["Imported Cru", "Wine by the Glass"],
    pairing: "Lake House Charcuterie",
    chefNote: "Delicate salmon-pink pour from Provence displaying vibrant wild strawberry notes, crushed citrus blossoms, and an ultra-refreshing flinty minerality."
  },
  {
    id: "salmon",
    outletId: "revivo",
    category: "Mains",
    name: "Green Herb Salmon",
    description: "Seared salmon, market greens, quinoa and citrus dressing.",
    price: 1750000,
    image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80",
    prepTime: "18–20 mins",
    tags: ["Wellness Kitchen", "High Protein", "Gluten-Free"],
    pairing: "Tropical Green Smoothie",
    chefNote: "Crispy-skinned Norwegian salmon fillet served over fluffy tri-color quinoa, baby greens, and a sun-drenched citrus herb dressing."
  },
  {
    id: "bowl",
    outletId: "revivo",
    category: "Bowls",
    name: "Garden Harvest Bowl",
    description: "Roasted vegetables, avocado, grains, seeds and tahini.",
    price: 1050000,
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    prepTime: "12–15 mins",
    tags: ["Plant-Based", "Nutrient-Dense"],
    pairing: "Tropical Green Smoothie",
    chefNote: "Fire-roasted sweet potato cubes, creamy avocado, crisp spiced chickpeas, shaved watermelon radish, and toasted seeds with house lemon-tahini drizzle."
  },
  {
    id: "smoothie",
    outletId: "revivo",
    category: "Drinks",
    name: "Tropical Green Smoothie",
    description: "Pineapple, cucumber, mint and young coconut.",
    price: 550000,
    image: "https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=900&q=80",
    prepTime: "5 mins",
    tags: ["Cold-Pressed", "Detox & Restore"],
    pairing: "Garden Harvest Bowl",
    chefNote: "Hydrating cold-pressed elixir of crisp cucumber, sweet tropical pineapple, baby spinach, young coconut water, and wild garden mint."
  },
  {
    id: "tenderloin",
    outletId: "restaurant-18",
    category: "Mains",
    name: "Pepper-crusted Tenderloin",
    description: "Tenderloin, truffle potato, seasonal greens and jus.",
    price: 2850000,
    image: "https://images.unsplash.com/photo-1694345598429-00511c301452?auto=format&fit=crop&w=900&q=80",
    prepTime: "25–30 mins",
    tags: ["Signature Cut", "Executive Chef Selection"],
    pairing: "Red Wine Reserve",
    chefNote: "Center-cut prime beef tenderloin encrusted with crushed Tellicherry black peppercorns, buttery truffle pomme purée, and a velvety 48-hour veal jus reduction."
  },
  {
    id: "risotto",
    outletId: "restaurant-18",
    category: "Mains",
    name: "Wild Mushroom Risotto",
    description: "Arborio rice, forest mushrooms, parmesan and herb oil.",
    price: 1950000,
    image: "https://images.unsplash.com/photo-1572424075298-e17403e6f3bf?auto=format&fit=crop&w=900&q=80",
    prepTime: "20–25 mins",
    tags: ["Vegetarian", "Slow Simmered"],
    pairing: "Dry White Wine",
    chefNote: "Carnaroli rice cooked slowly in rich aromatic broth with wild forest mushrooms, finished with 24-month Parmigiano-Reggiano and cold-pressed garden herb oil."
  },
];

export const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount / 100);
export const getItem = (id: string) => menuItems.find((item) => item.id === id);
export const cartLineTotal = (line: CartItem) =>
  ((getItem(line.itemId)?.price ?? 0) + line.choices.reduce((sum, choice) => sum + choice.price, 0)) * line.quantity;
export const cartTotal = (cart: CartItem[]) => cart.reduce((sum, item) => sum + cartLineTotal(item), 0);
