import type { Metadata } from "next";
import { Nunito_Sans, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OG_IMAGE, SITE_URL } from "@/lib/content";
import "./globals.css";

const playfair = Playfair_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const nunito = Nunito_Sans({
  weight: ["300", "400", "600"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Classic Car Rental for Weddings, Photo Shoots, and Parades | Chance Classics",
    template: "%s",
  },
  description:
    "Chance Classics is Northwest Louisiana’s premier classic car rental, with a fleet of chauffeured vintage cars for weddings, photo shoots, parades, and special events across Shreveport, Bossier, and surrounding areas.",
  verification: { google: "P91eKA62ipDzmXGRzpoHcba1SdcyUAahw_4frZrCnAc" },
  openGraph: {
    siteName: "Chance Classics, Classic Car Rental",
    type: "website",
    images: [{ url: OG_IMAGE, alt: "Chance Classics" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org/",
  "@type": "LocalBusiness",
  name: "Chance Classic Car Rental",
  url: SITE_URL,
  image: `${SITE_URL}${OG_IMAGE}`,
  telephone: "+13183445001",
  email: "chanceclassics@gmail.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "118 5th Street",
    addressLocality: "Benton",
    addressRegion: "LA",
    postalCode: "71006-9471",
    addressCountry: "US",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${nunito.variable}`}>
      <body>
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5XPGW2CT');`}
        </Script>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1193922355243190');
fbq('track', 'PageView');`}
        </Script>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-5XPGW2CT"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <a className="skip" href="#main">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
