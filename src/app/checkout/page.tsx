import CheckoutWrapper from "./wrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default function CheckoutPage() {
  return <CheckoutWrapper />;
}
