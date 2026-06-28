export function generateMetadata() {
  return { title: 'Privacy Policy - DealRadar' };
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-zinc-800">
      <h1 className="mb-6 text-3xl font-bold">Privacy Policy (Datenschutzerklärung)</h1>
      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-xl font-semibold">1. Overview of Data Protection</h2>
          <p>
            DealRadar respects your privacy and is committed to protecting your personal data in compliance with the General Data Protection Regulation (GDPR - EU 2016/679). This privacy policy informs you about how we handle your personal data when you visit our website.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">2. Data Controller</h2>
          <p>
            The data controller responsible for processing data on this website is DealRadar Europe Ltd. (contact@dealradar.eu).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">3. Data Collection on Our Website</h2>
          <p>
            <strong>Price Alert Subscriptions:</strong> When you subscribe to a price drop alert, we collect and store your email address and the target product ID. This data is used solely to dispatch price drop notifications. You can unsubscribe at any time via the link provided in every alert email.
          </p>
          <p className="mt-2">
            <strong>Server Log Files & Edge Hosting:</strong> Our hosting providers automatically collect information in server log files (IP address, browser type, referrer URL, operating system). This processing is based on Art. 6(1)(f) GDPR for secure system operation.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">4. Affiliate Links & Cookies</h2>
          <p>
            DealRadar participates in affiliate partner programs (e.g. Awin, Kelkoo, Tradedoubler). When you click an outbound deal link, you are redirected to the merchant via an affiliate tracking link containing a anonymized subID parameter. No personally identifiable profiling data is transferred.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">5. Your Rights Under GDPR</h2>
          <p>
            Under GDPR Art. 15-21, you have the right to access, rectify, erase ('right to be forgotten'), restrict processing, and request data portability regarding your stored personal data. Contact contact@dealradar.eu to exercise your rights.
          </p>
        </section>
      </div>
    </div>
  );
}
