import { useTranslations } from 'next-intl';

export function generateMetadata() {
  return { title: 'Imprint (Impressum) - DealRadar' };
}

export default function ImprintPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-zinc-800">
      <h1 className="mb-6 text-3xl font-bold">Imprint (Impressum)</h1>
      <div className="space-y-4 text-sm leading-relaxed">
        <p><strong>DealRadar Europe Ltd.</strong></p>
        <p>Information according to § 5 TMG / European E-Commerce Directive:</p>
        <p>
          DealRadar Systems<br />
          Tech Park Hub, Rue de la Loi 200<br />
          1040 Brussels, Belgium
        </p>
        <p><strong>Represented by:</strong> Management Board</p>
        <p><strong>Contact:</strong> Email: contact@dealradar.eu</p>
        <p><strong>VAT ID:</strong> BE 0123.456.789</p>
        <hr className="my-6 border-zinc-200" />
        <h2 className="text-lg font-semibold">Dispute Resolution</h2>
        <p>
          The European Commission provides a platform for online dispute resolution (OS):{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-accent underline">
            https://ec.europa.eu/consumers/odr
          </a>. We are neither obligated nor willing to participate in dispute resolution proceedings before a consumer arbitration board.
        </p>
      </div>
    </div>
  );
}
