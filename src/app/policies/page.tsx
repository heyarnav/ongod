import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";

export const metadata = {
  title: "Policies",
  description:
    "Pre-order terms, production timeline, remedies for defective or damaged pieces, and shipping information for on god.",
};

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "PRE-ORDER TERMS",
    body: [
      "Objects released by on god. are produced as limited editions. A pre-order reserves your piece in that edition; production begins after the pre-order window closes.",
      "Estimated production and dispatch periods are stated on each object's page and confirmed at checkout. Timelines are estimates, not guarantees — if the archive must revise them, registered customers are notified by email.",
      "You may cancel a pre-order for a full refund at any point before production begins. Once the edition enters production, the order cannot be cancelled but remains covered by the remedies below.",
    ],
  },
  {
    title: "DAMAGED / DEFECTIVE / INCORRECT",
    body: [
      "If your piece arrives damaged, defective, or is not what you ordered, write to us within 14 days of delivery. Include your order number and photographs of the fault and we will respond.",
      "Qualifying cases are remedied at our cost — a replacement from the edition where one remains, a repair, or a refund. You will not be asked to pay for return shipping on our errors.",
      "Every claim is reviewed by a person. You receive the outcome and reasoning at your registered email.",
    ],
  },
  {
    title: "SHIPPING",
    body: [
      "Orders are individually packed and dispatched from Mumbai, India. Tracking is issued at the SHIPPED stage and appears in your account register.",
      "Pre-order items dispatch within the estimated period stated at checkout. Multiple items ship together once the edition completes.",
    ],
  },
  {
    title: "CONTACT",
    body: [
      "For anything not covered here, write to archive@ongod.in from the address on your order register. Every message is answered.",
    ],
  },
];

export default function PoliciesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-32 pt-28 md:px-10 md:pt-36">
      <div className="flex items-center gap-3">
        <RegistrationMark className="h-3.5 w-3.5" />
        <ArchiveLabel tone="crimson">TERMS OF THE ARCHIVE</ArchiveLabel>
      </div>
      <h1 className="mt-5 font-serif-d text-5xl font-light text-bone md:text-6xl">Policies</h1>

      <div className="mt-14">
        {SECTIONS.map((s) => (
          <section key={s.title} className="border-t border-bone/26 py-8">
            <ArchiveLabel>{s.title}</ArchiveLabel>
            <div className="mt-4 space-y-3">
              {s.body.map((p, i) => (
                <p key={i} className="font-mono text-[11px] leading-relaxed text-bone/69">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
