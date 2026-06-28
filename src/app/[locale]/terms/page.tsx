export function generateMetadata() {
  return { title: 'Terms of Service - DealRadar' };
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-zinc-800">
      <h1 className="mb-6 text-3xl font-bold">Terms of Service</h1>
      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-xl font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing and using DealRadar, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use our service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">2. Service Description & Price Accuracy</h2>
          <p>
            DealRadar is a localized deal aggregator that displays product offers gathered from third-party affiliate networks and merchants. While we make every effort to provide accurate, real-time prices, product availability and prices displayed on merchant sites take precedence and are governed by the respective merchant's terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">3. Affiliate Disclosure</h2>
          <p>
            Outbound links on DealRadar are affiliate links. DealRadar may earn a referral commission on qualifying purchases made through these links at no extra cost to you.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">4. Limitation of Liability</h2>
          <p>
            DealRadar is provided on an "as-is" basis without warranties of any kind. We are not responsible for transactions or agreements concluded between users and third-party merchants.
          </p>
        </section>
      </div>
    </div>
  );
}
