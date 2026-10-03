import { listAddresses } from "@/lib/addresses-server";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { AddressBook } from "@/components/account/AddressBook";

export const dynamic = "force-dynamic";

/**
 * /account/addresses — the customer's saved destinations.
 *
 * Rendered on the server so the book is readable before any client fetch. RLS
 * scopes the query to the signed-in customer; the component handles mutations.
 */
export default async function AccountAddressesPage() {
  const addresses = await listAddresses();

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <ArchiveLabel tone="faint">SAVED ADDRESSES ({addresses.length})</ArchiveLabel>
        <p className="font-mono text-[9px] tracking-[0.25em] text-faint">OFFERED AT CHECKOUT</p>
      </div>

      <div className="mt-4">
        <AddressBook initial={addresses} />
      </div>

      <p className="mt-6 font-mono text-[10px] leading-relaxed text-faint">
        Editing an address never changes an order that has already been placed — each order keeps
        its own copy of the address it shipped to.
      </p>
    </div>
  );
}
