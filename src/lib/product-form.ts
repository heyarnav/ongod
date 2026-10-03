/**
 * Product form shape and defaults.
 *
 * Lives outside the client component because `/admin/products/new` needs
 * `emptyForm()` on the SERVER to seed the initial props, and a function
 * exported from a "use client" module cannot be called from a server
 * component. Both sides import it from here.
 */

export type ProductFormValues = {
  slug: string;
  name: string;
  archiveNumber: string;
  subtitle: string;
  collectionId: string | null;
  description: string;
  story: string;
  purpose: string;
  limitation: string;
  state: string;
  adaptation: string;
  priceRupees: string;
  comparePriceRupees: string;
  model: string;
  featured: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  // drop lifecycle
  dropStatus: string;
  editionLabel: string;
  preOrderStarts: string; // datetime-local string
  preOrderEnds: string;
  productionPeriod: string;
  dispatchPeriod: string;
  preOrderNotice: string;
  inProductionMessage: string;
  fulfillingMessage: string;
  soldOutMessage: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  sortOrder: number;
};

export function emptyForm(sortOrder = 0): ProductFormValues {
  return {
    slug: "",
    name: "",
    archiveNumber: "001",
    subtitle: "",
    collectionId: null,
    description: "",
    story: "",
    purpose: "PERFECTION",
    limitation: "MORTALITY",
    state: "INCOMPLETE",
    adaptation: "ONGOING",
    priceRupees: "",
    comparePriceRupees: "",
    model: "",
    featured: false,
    status: "DRAFT",
    dropStatus: "DRAFT",
    editionLabel: "FIRST EDITION",
    preOrderStarts: "",
    preOrderEnds: "",
    productionPeriod: "",
    dispatchPeriod: "",
    preOrderNotice: "",
    inProductionMessage: "",
    fulfillingMessage: "",
    soldOutMessage: "",
    seoTitle: "",
    seoDescription: "",
    ogImage: "",
    sortOrder,
  };
}