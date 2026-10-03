/** Shared view-model + utility types for the archive. */

export type CollectionSummary = {
  id: string;
  slug: string;
  name: string;
  number: string;
  subtitle: string;
  description: string;
  heroImage: string;
  artwork: string;
  published: boolean;
  sortOrder: number;
};

export type ProductImageVM = {
  id: string;
  url: string;
  alt: string;
  type: string; // hero | front | back | detail | artwork | thumbnail
  order: number;
};

export type ProductVariantVM = {
  id: string;
  size: string;
  stock: number;
};

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  archiveNumber: string;
  subtitle: string;
  price: number; // minor units
  comparePrice: number | null;
  currency: string;
  status: string;
  featured: boolean;
  cover: string; // best image URL or ""
  collection: { slug: string; name: string; number: string } | null;
  totalStock: number;
  // drop lifecycle
  dropStatus: string;
  editionLabel: string;
  preOrderStartsAt: string | null; // ISO
  preOrderEndsAt: string | null; // ISO
  productionPeriod: string;
  dispatchPeriod: string;
  preOrderNotice: string;
};

export type ProductDetail = ProductSummary & {
  description: string;
  story: string;
  purpose: string;
  limitation: string;
  state: string;
  adaptation: string;
  model: string;
  sizes: string[];
  images: ProductImageVM[];
  variants: ProductVariantVM[];
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  inProductionMessage: string;
  fulfillingMessage: string;
  soldOutMessage: string;
};

export type CartLine = {
  productId: string;
  slug: string;
  name: string;
  archiveNumber: string;
  collectionName: string;
  size: string;
  price: number;
  quantity: number;
  image: string;
  maxStock: number;
  dropStatus: string; // "PRE_ORDER" etc — snapshot at add-time
  editionLabel: string;
};

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  archiveNumber: string;
  collectionName: string;
  collectionId: string | null;
  price: number;
  status: string;
  featured: boolean;
  sortOrder: number;
  cover: string;
  imageCount: number;
  totalStock: number;
  updatedAt: string;
};
