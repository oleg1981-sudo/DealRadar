/** The category tree. Icons are lucide-react names resolved in CategoryMenu. */
import type { CategorySlug } from './providers/types';

/** A second-level department, optionally holding third-level leaf categories. */
export interface SubCategory {
  name: string;
  children?: string[];
}

export interface Category {
  slug: CategorySlug;
  icon: string; // lucide icon name
  /**
   * Two-level subtree (department → leaf). Names are display strings mapped to
   * search terms (`/search?category=<slug>&q=<name>`), not i18n keys — only the
   * top-level `slug` is translated.
   */
  children: SubCategory[];
}

export const CATEGORIES: Category[] = [
  {
    slug: 'electronics',
    icon: 'MonitorSmartphone',
    children: [
      { name: 'Computers', children: ['Laptops', 'Desktop PCs', 'Monitors', 'Computer Hardware', 'Storage', 'Peripherals'] },
      { name: 'TVs', children: ['OLED TVs', 'QLED & LED TVs', 'Soundbars', 'Streaming Devices', 'TV Accessories'] },
      { name: 'Home Audio', children: ['Speakers', 'Headphones', 'Hi-Fi Systems', 'Microphones'] },
      { name: 'Phones & Wearables', children: ['Smartphones', 'Smartwatches', 'Tablets', 'Cases & Chargers'] },
      // DIY repair parts (GSMnet et al.). Leaf terms are the German words in the
      // part names — "Rückkamera" (10) beats "Kamera" (6) in matchSubCategory's
      // longest-match, so a replacement camera module lands here, not under
      // Cameras, while a real "Digitalkamera" (no repair leaf) stays in Cameras.
      { name: 'Fix It Yourself', children: ['Rückkamera', 'Frontkamera', 'Displayeinheit', 'Ladebuchse', 'Ladeanschluss', 'Ersatzakku', 'Akkudeckel', 'Flexkabel', 'Mittelrahmen', 'Backcover', 'Ersatzteil', 'Reparatur'] },
      { name: 'Gaming', children: ['Consoles', 'Video Games', 'Controllers', 'Gaming PCs', 'VR Headsets'] },
      { name: 'Cameras', children: ['Digital Cameras', 'Lenses', 'Drones', 'Action Cameras', 'Kamera'] },
      { name: 'Home Appliances', children: ['Washing Machines', 'Fridges', 'Vacuum Cleaners', 'Coffee Machines'] },
      { name: 'Solar', children: ['Balkonkraftwerk', 'Solarmodul', 'Solar-Erweiterungsset', 'Wechselrichter', 'Erweiterungsakku', 'Halterung'] },
    ],
  },
  {
    slug: 'fashion',
    icon: 'Shirt',
    children: [
      { name: 'Women', children: ['Dresses', 'Tops', 'Jeans', 'Coats & Jackets', 'Lingerie'] },
      { name: 'Men', children: ['Shirts', 'T-Shirts', 'Trousers', 'Suits', 'Jackets'] },
      { name: 'Kids & Baby', children: ['Girls', 'Boys', 'Baby', 'Schoolwear'] },
      { name: 'Shoes', children: ['Sneakers', 'Boots', 'Heels', 'Sandals', 'Sports Shoes'] },
      { name: 'Accessories', children: ['Bags', 'Watches', 'Jewellery', 'Belts', 'Sunglasses'] },
      { name: 'Sportswear', children: ['Activewear', 'Outdoor Clothing', 'Swimwear'] },
    ],
  },
  {
    slug: 'home-garden',
    icon: 'Sofa',
    children: [
      { name: 'Furniture', children: ['Sofas', 'Beds', 'Tables & Chairs', 'Storage', 'Office Furniture'] },
      { name: 'Kitchen', children: ['Cookware', 'Tableware', 'Small Appliances', 'Knives', 'Food Storage', 'Vorratsdosen'] },
      { name: 'Home Decor', children: ['Lighting', 'Rugs', 'Curtains', 'Wall Art', 'Candles'] },
      { name: 'Bed & Bath', children: ['Bedding', 'Towels', 'Mattresses', 'Bathroom Accessories', 'Seifenspender'] },
      { name: 'DIY & Tools', children: ['Power Tools', 'Hand Tools', 'Paint', 'Hardware'] },
      { name: 'Garden', children: ['Plants', 'Garden Furniture', 'BBQ & Grills', 'Garden Tools', 'Lawn Care'] },
    ],
  },
  {
    slug: 'sports',
    icon: 'Bike',
    children: [
      { name: 'Fitness', children: ['Treadmills', 'Weights', 'Yoga', 'Home Gym', 'Fitness Accessories'] },
      { name: 'Cycling', children: ['Bikes', 'E-Bikes', 'Helmets', 'Bike Parts', 'Cycling Clothing'] },
      { name: 'Running', children: ['Running Shoes', 'Running Apparel', 'GPS Watches', 'Accessories'] },
      { name: 'Outdoor', children: ['Camping', 'Hiking', 'Backpacks', 'Tents', 'Climbing'] },
      { name: 'Team Sports', children: ['Football', 'Basketball', 'Tennis', 'Golf'] },
      { name: 'Water & Winter', children: ['Swimming', 'Ski & Snowboard', 'Surfing'] },
    ],
  },
  {
    slug: 'beauty',
    icon: 'Sparkles',
    children: [
      { name: 'Skincare', children: ['Moisturisers', 'Cleansers', 'Serums', 'Sun Care', 'Face Masks'] },
      { name: 'Make-up', children: ['Face', 'Eyes', 'Lips', 'Nails', 'Brushes'] },
      { name: 'Fragrance', children: ["Women's Perfume", "Men's Aftershave", 'Gift Sets'] },
      { name: 'Hair Care', children: ['Shampoo', 'Styling', 'Hair Tools', 'Hair Colour'] },
      { name: 'Personal Care', children: ['Electric Shavers', 'Oral Care', 'Bath & Body'] },
      { name: 'Health', children: ['Teststreifen'] },
    ],
  },
  {
    slug: 'food-grocery',
    icon: 'ShoppingBasket',
    children: [
      { name: 'Coffee & Tea', children: ['Coffee Beans', 'Coffee Capsules', 'Tea', 'Coffee Machines'] },
      { name: 'Pantry', children: ['Pasta & Rice', 'Oils & Sauces', 'Baking', 'Tinned Food'] },
      { name: 'Drinks', children: ['Water', 'Soft Drinks', 'Juices', 'Energy Drinks'] },
      { name: 'Beer, Wine & Spirits', children: ['Wine', 'Beer', 'Spirits', 'Champagne'] },
      { name: 'Snacks', children: ['Chocolate', 'Crisps', 'Biscuits', 'Nuts'] },
      { name: 'Organic & Health', children: ['Organic', 'Vegan', 'Supplements', 'Gluten-Free'] },
    ],
  },
  {
    slug: 'toys',
    icon: 'Blocks',
    children: [
      { name: 'Building Sets', children: ['LEGO', 'Building Blocks', 'Model Kits', 'Marble Runs'] },
      { name: 'Games & Puzzles', children: ['Board Games', 'Puzzles', 'Card Games', 'Educational Games'] },
      { name: 'Action & Dolls', children: ['Action Figures', 'Dolls', 'Playsets', 'Collectibles'] },
      { name: 'Outdoor Play', children: ['Trampolines', 'Ride-Ons', 'Swing Sets', 'Water Toys'] },
      { name: 'Baby & Toddler', children: ['Soft Toys', 'Activity Toys', 'Bath Toys'] },
      { name: 'Hobbies', children: ['Arts & Crafts', 'Science Kits', 'RC Toys'] },
    ],
  },
  {
    slug: 'automotive',
    icon: 'Car',
    children: [
      { name: 'Tyres & Wheels', children: ['Summer Tyres', 'Winter Tyres', 'All-Season Tyres', 'Alloy Wheels'] },
      { name: 'Car Parts', children: ['Brakes', 'Batteries', 'Filters', 'Lighting'] },
      { name: 'Car Care', children: ['Cleaning', 'Polish & Wax', 'Tools', 'Fluids'] },
      { name: 'Car Electronics', children: ['Dash Cams', 'Sat Nav', 'Car Audio', 'Parking Sensors'] },
      { name: 'Interior & Exterior', children: ['Seat Covers', 'Floor Mats', 'Roof Boxes', 'Child Seats'] },
      { name: 'Motorcycle', children: ['Helmets', 'Riding Gear', 'Motorcycle Parts', 'Accessories'] },
    ],
  },
  {
    slug: 'books',
    icon: 'BookOpen',
    children: [
      { name: 'Fiction', children: ['Crime & Thriller', 'Romance', 'Sci-Fi & Fantasy', 'Literary Fiction'] },
      { name: 'Non-Fiction', children: ['Biography', 'History', 'Self-Help', 'Business', 'Science'] },
      { name: "Children's Books", children: ['Picture Books', 'Early Readers', 'Young Adult'] },
      { name: 'Comics & Manga', children: ['Graphic Novels', 'Manga', 'Comics'] },
      { name: 'Education', children: ['Textbooks', 'Languages', 'Reference', 'Study Guides'] },
      { name: 'eBooks & Audio', children: ['eBooks', 'Audiobooks', 'eReaders'] },
    ],
  },
  {
    slug: 'travel',
    icon: 'Plane',
    children: [
      { name: 'Luggage', children: ['Suitcases', 'Cabin Bags', 'Travel Backpacks', 'Travel Bags'] },
      { name: 'Travel Accessories', children: ['Adapters', 'Packing Cubes', 'Neck Pillows', 'Luggage Locks'] },
      { name: 'Outdoor & Camping', children: ['Tents', 'Sleeping Bags', 'Camping Gear', 'Cool Boxes'] },
      { name: 'Holidays', children: ['City Breaks', 'Beach Holidays', 'Package Deals', 'Flights'] },
      { name: 'Experiences', children: ['Day Trips', 'Activities', 'Spa & Wellness'] },
    ],
  },
  {
    // Leaf terms are the search `q` and — because the pet catalogue is
    // German (Lyra Pet) — are the German words that actually occur in the
    // product names, so the subcategory filters return real results.
    slug: 'pets',
    icon: 'PawPrint',
    children: [
      { name: 'Dogs', children: ['Hundefutter', 'Entenhälse'] },
      { name: 'Cats', children: ['Katzenfutter', 'Katzenstreu'] },
      { name: 'Horses', children: ['Mineralfutter', 'Lyra Horse'] },
      { name: 'Wet Food', children: ['Fleischmahlzeit'] },
      { name: 'Pet Care', children: ['Flohspray', 'Wespenspray'] },
    ],
  },
  {
    // Pharmacy catalogue (Aliva) is German — leaf terms are the German words
    // in the product names.
    slug: 'health',
    icon: 'HeartPulse',
    children: [
      { name: 'Supplements', children: ['Nahrungsergänzung', 'Vitamin', 'Magnesium', 'Mikronährstoffe'] },
      { name: 'Medicines', children: ['Kapseln', 'Tabletten', 'Tropfen', 'Ampullen'] },
      { name: 'Medical Nutrition', children: ['Fresubin', 'Fortimel'] },
      { name: 'Personal Care', children: ['Salbe', 'Balsam', 'Shampoo'] },
    ],
  },
];

/**
 * Best subcategory for a product, derived the same way search works: a leaf
 * term (or the subcategory name) appearing in the product name. Substring,
 * case-insensitive — German compounds ("Wildkamera" → 'Kamera') have no word
 * boundaries, and the site's search matches leaves the same way. The LONGEST
 * matching term wins so 'Solar-Erweiterungsset' beats 'Solarmodul'.
 * Used by the deal-page breadcrumb: Home › category › subcategory › product.
 */
export function matchSubCategory(
  slug: CategorySlug,
  productName: string,
): { name: string; leaf: string } | null {
  const category = CATEGORIES.find((c) => c.slug === slug);
  if (!category) return null;
  const hay = productName.toLowerCase();
  let best: { name: string; leaf: string; len: number } | null = null;
  for (const sub of category.children) {
    for (const term of [...(sub.children ?? []), sub.name]) {
      if (term.length > (best?.len ?? 0) && hay.includes(term.toLowerCase())) {
        best = { name: sub.name, leaf: term, len: term.length };
      }
    }
  }
  return best ? { name: best.name, leaf: best.leaf } : null;
}
