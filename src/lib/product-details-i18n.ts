/**
 * Translations for the synthetic spec table in the detailed-card modal
 * ([product-details.ts]). Labels and the textual (non-numeric, non-brand)
 * values are localized here; numbers, units (kg, Hz, W, cm), acronyms
 * (HDR, OLED, SKU, Wi-Fi…) and brand names fall back to English.
 */
import type { Locale } from '@/i18n/routing';

type T = Partial<Record<Locale, string>>;

const SPEC_LABELS: Record<string, T> = {
  'Brand': { de: 'Marke', es: 'Marca', fr: 'Marque', it: 'Marca', nl: 'Merk', pl: 'Marka', pt: 'Marca', sv: 'Märke', ro: 'Marcă' },
  'Model': { de: 'Modell', es: 'Modelo', fr: 'Modèle', it: 'Modello', nl: 'Model', pl: 'Model', pt: 'Modelo', sv: 'Modell', ro: 'Model' },
  'Color': { de: 'Farbe', es: 'Color', fr: 'Couleur', it: 'Colore', nl: 'Kleur', pl: 'Kolor', pt: 'Cor', sv: 'Färg', ro: 'Culoare' },
  'Condition': { de: 'Zustand', es: 'Estado', fr: 'État', it: 'Condizione', nl: 'Staat', pl: 'Stan', pt: 'Estado', sv: 'Skick', ro: 'Stare' },
  'Warranty': { de: 'Garantie', es: 'Garantía', fr: 'Garantie', it: 'Garanzia', nl: 'Garantie', pl: 'Gwarancja', pt: 'Garantia', sv: 'Garanti', ro: 'Garanție' },
  'Weight': { de: 'Gewicht', es: 'Peso', fr: 'Poids', it: 'Peso', nl: 'Gewicht', pl: 'Waga', pt: 'Peso', sv: 'Vikt', ro: 'Greutate' },
  'Availability': { de: 'Verfügbarkeit', es: 'Disponibilidad', fr: 'Disponibilité', it: 'Disponibilità', nl: 'Beschikbaarheid', pl: 'Dostępność', pt: 'Disponibilidade', sv: 'Tillgänglighet', ro: 'Disponibilitate' },
  'Screen size': { de: 'Bildschirmgröße', es: 'Tamaño de pantalla', fr: "Taille d'écran", it: 'Dimensione schermo', nl: 'Schermgrootte', pl: 'Przekątna ekranu', pt: 'Tamanho do ecrã', sv: 'Skärmstorlek', ro: 'Diagonală' },
  'Resolution': { de: 'Auflösung', es: 'Resolución', fr: 'Résolution', it: 'Risoluzione', nl: 'Resolutie', pl: 'Rozdzielczość', pt: 'Resolução', sv: 'Upplösning', ro: 'Rezoluție' },
  'Refresh rate': { de: 'Bildwiederholrate', es: 'Frecuencia de actualización', fr: 'Fréquence de rafraîchissement', it: 'Frequenza di aggiornamento', nl: 'Verversingssnelheid', pl: 'Częstotliwość odświeżania', pt: 'Taxa de atualização', sv: 'Uppdateringsfrekvens', ro: 'Rată de reîmprospătare' },
  'Panel': { de: 'Panel', es: 'Panel', fr: 'Dalle', it: 'Pannello', nl: 'Paneel', pl: 'Panel', pt: 'Painel', sv: 'Panel', ro: 'Panou' },
  'Connectivity': { de: 'Konnektivität', es: 'Conectividad', fr: 'Connectivité', it: 'Connettività', nl: 'Connectiviteit', pl: 'Łączność', pt: 'Conetividade', sv: 'Anslutning', ro: 'Conectivitate' },
  'HDMI ports': { de: 'HDMI-Anschlüsse', es: 'Puertos HDMI', fr: 'Ports HDMI', it: 'Porte HDMI', nl: 'HDMI-poorten', pl: 'Porty HDMI', pt: 'Portas HDMI', sv: 'HDMI-portar', ro: 'Porturi HDMI' },
  'USB ports': { de: 'USB-Anschlüsse', es: 'Puertos USB', fr: 'Ports USB', it: 'Porte USB', nl: 'USB-poorten', pl: 'Porty USB', pt: 'Portas USB', sv: 'USB-portar', ro: 'Porturi USB' },
  'Battery life': { de: 'Akkulaufzeit', es: 'Duración de la batería', fr: 'Autonomie', it: 'Durata batteria', nl: 'Batterijduur', pl: 'Czas pracy baterii', pt: 'Duração da bateria', sv: 'Batteritid', ro: 'Autonomie baterie' },
  'Power': { de: 'Leistung', es: 'Potencia', fr: 'Puissance', it: 'Potenza', nl: 'Vermogen', pl: 'Moc', pt: 'Potência', sv: 'Effekt', ro: 'Putere' },
  'Energy class': { de: 'Energieklasse', es: 'Clase energética', fr: 'Classe énergétique', it: 'Classe energetica', nl: 'Energieklasse', pl: 'Klasa energetyczna', pt: 'Classe energética', sv: 'Energiklass', ro: 'Clasă energetică' },
  'Operating system': { de: 'Betriebssystem', es: 'Sistema operativo', fr: "Système d'exploitation", it: 'Sistema operativo', nl: 'Besturingssysteem', pl: 'System operacyjny', pt: 'Sistema operativo', sv: 'Operativsystem', ro: 'Sistem de operare' },
  'Voice control': { de: 'Sprachsteuerung', es: 'Control por voz', fr: 'Commande vocale', it: 'Controllo vocale', nl: 'Spraakbesturing', pl: 'Sterowanie głosowe', pt: 'Controlo por voz', sv: 'Röststyrning', ro: 'Control vocal' },
  'Smart features': { de: 'Smart-Funktionen', es: 'Funciones smart', fr: 'Fonctions connectées', it: 'Funzioni smart', nl: 'Smart-functies', pl: 'Funkcje smart', pt: 'Funções smart', sv: 'Smarta funktioner', ro: 'Funcții smart' },
  'Material': { de: 'Material', es: 'Material', fr: 'Matériau', it: 'Materiale', nl: 'Materiaal', pl: 'Materiał', pt: 'Material', sv: 'Material', ro: 'Material' },
  'Dimensions': { de: 'Maße', es: 'Dimensiones', fr: 'Dimensions', it: 'Dimensioni', nl: 'Afmetingen', pl: 'Wymiary', pt: 'Dimensões', sv: 'Mått', ro: 'Dimensiuni' },
  'Country of origin': { de: 'Herkunftsland', es: 'País de origen', fr: "Pays d'origine", it: 'Paese di origine', nl: 'Land van herkomst', pl: 'Kraj pochodzenia', pt: 'País de origem', sv: 'Ursprungsland', ro: 'Țară de origine' },
  'Returns': { de: 'Rückgabe', es: 'Devoluciones', fr: 'Retours', it: 'Resi', nl: 'Retourneren', pl: 'Zwroty', pt: 'Devoluções', sv: 'Returer', ro: 'Retururi' },
  'Shipping': { de: 'Versand', es: 'Envío', fr: 'Livraison', it: 'Spedizione', nl: 'Verzending', pl: 'Wysyłka', pt: 'Envio', sv: 'Frakt', ro: 'Livrare' },
};

const SPEC_VALUES: Record<string, T> = {
  // Colours
  'Black': { de: 'Schwarz', es: 'Negro', fr: 'Noir', it: 'Nero', nl: 'Zwart', pl: 'Czarny', pt: 'Preto', sv: 'Svart', ro: 'Negru' },
  'White': { de: 'Weiß', es: 'Blanco', fr: 'Blanc', it: 'Bianco', nl: 'Wit', pl: 'Biały', pt: 'Branco', sv: 'Vit', ro: 'Alb' },
  'Silver': { de: 'Silber', es: 'Plata', fr: 'Argent', it: 'Argento', nl: 'Zilver', pl: 'Srebrny', pt: 'Prateado', sv: 'Silver', ro: 'Argintiu' },
  'Graphite': { de: 'Graphit', es: 'Grafito', fr: 'Graphite', it: 'Grafite', nl: 'Grafiet', pl: 'Grafitowy', pt: 'Grafite', sv: 'Grafit', ro: 'Grafit' },
  'Blue': { de: 'Blau', es: 'Azul', fr: 'Bleu', it: 'Blu', nl: 'Blauw', pl: 'Niebieski', pt: 'Azul', sv: 'Blå', ro: 'Albastru' },
  'Green': { de: 'Grün', es: 'Verde', fr: 'Vert', it: 'Verde', nl: 'Groen', pl: 'Zielony', pt: 'Verde', sv: 'Grön', ro: 'Verde' },
  'Red': { de: 'Rot', es: 'Rojo', fr: 'Rouge', it: 'Rosso', nl: 'Rood', pl: 'Czerwony', pt: 'Vermelho', sv: 'Röd', ro: 'Roșu' },
  // Condition
  'New': { de: 'Neu', es: 'Nuevo', fr: 'Neuf', it: 'Nuovo', nl: 'Nieuw', pl: 'Nowy', pt: 'Novo', sv: 'Ny', ro: 'Nou' },
  // Warranty
  '1 year': { de: '1 Jahr', es: '1 año', fr: '1 an', it: '1 anno', nl: '1 jaar', pl: '1 rok', pt: '1 ano', sv: '1 år', ro: '1 an' },
  '2 years': { de: '2 Jahre', es: '2 años', fr: '2 ans', it: '2 anni', nl: '2 jaar', pl: '2 lata', pt: '2 anos', sv: '2 år', ro: '2 ani' },
  '3 years': { de: '3 Jahre', es: '3 años', fr: '3 ans', it: '3 anni', nl: '3 jaar', pl: '3 lata', pt: '3 anos', sv: '3 år', ro: '3 ani' },
  // Materials
  'Aluminium': { de: 'Aluminium', es: 'Aluminio', fr: 'Aluminium', it: 'Alluminio', nl: 'Aluminium', pl: 'Aluminium', pt: 'Alumínio', sv: 'Aluminium', ro: 'Aluminiu' },
  'Plastic': { de: 'Kunststoff', es: 'Plástico', fr: 'Plastique', it: 'Plastica', nl: 'Kunststof', pl: 'Plastik', pt: 'Plástico', sv: 'Plast', ro: 'Plastic' },
  'Steel': { de: 'Stahl', es: 'Acero', fr: 'Acier', it: 'Acciaio', nl: 'Staal', pl: 'Stal', pt: 'Aço', sv: 'Stål', ro: 'Oțel' },
  'Composite': { de: 'Verbundwerkstoff', es: 'Composite', fr: 'Composite', it: 'Composito', nl: 'Composiet', pl: 'Kompozyt', pt: 'Compósito', sv: 'Komposit', ro: 'Compozit' },
  // Country of origin
  'Germany': { de: 'Deutschland', es: 'Alemania', fr: 'Allemagne', it: 'Germania', nl: 'Duitsland', pl: 'Niemcy', pt: 'Alemanha', sv: 'Tyskland', ro: 'Germania' },
  'China': { de: 'China', es: 'China', fr: 'Chine', it: 'Cina', nl: 'China', pl: 'Chiny', pt: 'China', sv: 'Kina', ro: 'China' },
  'Poland': { de: 'Polen', es: 'Polonia', fr: 'Pologne', it: 'Polonia', nl: 'Polen', pl: 'Polska', pt: 'Polónia', sv: 'Polen', ro: 'Polonia' },
  'Vietnam': { de: 'Vietnam', es: 'Vietnam', fr: 'Vietnam', it: 'Vietnam', nl: 'Vietnam', pl: 'Wietnam', pt: 'Vietname', sv: 'Vietnam', ro: 'Vietnam' },
  'Czechia': { de: 'Tschechien', es: 'Chequia', fr: 'Tchéquie', it: 'Cechia', nl: 'Tsjechië', pl: 'Czechy', pt: 'Chéquia', sv: 'Tjeckien', ro: 'Cehia' },
  // OS / voice / smart
  'Proprietary': { de: 'Proprietär', es: 'Propietario', fr: 'Propriétaire', it: 'Proprietario', nl: 'Eigen systeem', pl: 'Zastrzeżony', pt: 'Proprietário', sv: 'Eget system', ro: 'Proprietar' },
  'Both': { de: 'Beide', es: 'Ambos', fr: 'Les deux', it: 'Entrambi', nl: 'Beide', pl: 'Oba', pt: 'Ambos', sv: 'Båda', ro: 'Ambele' },
  'Yes': { de: 'Ja', es: 'Sí', fr: 'Oui', it: 'Sì', nl: 'Ja', pl: 'Tak', pt: 'Sim', sv: 'Ja', ro: 'Da' },
  'No': { de: 'Nein', es: 'No', fr: 'Non', it: 'No', nl: 'Nee', pl: 'Nie', pt: 'Não', sv: 'Nej', ro: 'Nu' },
  // Shipping / returns / stock
  'Free': { de: 'Kostenlos', es: 'Gratis', fr: 'Gratuite', it: 'Gratuita', nl: 'Gratis', pl: 'Bezpłatna', pt: 'Grátis', sv: 'Gratis', ro: 'Gratuită' },
  '30-day free returns': { de: '30 Tage kostenlose Rückgabe', es: 'Devoluciones gratis 30 días', fr: 'Retours gratuits sous 30 jours', it: 'Resi gratuiti entro 30 giorni', nl: '30 dagen gratis retour', pl: '30 dni na darmowy zwrot', pt: 'Devoluções grátis em 30 dias', sv: 'Fri retur i 30 dagar', ro: 'Retur gratuit în 30 de zile' },
  'in stock': { de: 'auf Lager', es: 'en stock', fr: 'en stock', it: 'disponibili', nl: 'op voorraad', pl: 'w magazynie', pt: 'em stock', sv: 'i lager', ro: 'în stoc' },
};

/** Localized spec label; falls back to English. */
export function specLabel(label: string, locale: string): string {
  if (locale === 'en') return label;
  return SPEC_LABELS[label]?.[locale as Locale] ?? label;
}

/** Localized spec value (textual ones); numbers/units/brands fall back to English. */
export function specValue(value: string, locale: string): string {
  if (locale === 'en') return value;
  return SPEC_VALUES[value]?.[locale as Locale] ?? value;
}
