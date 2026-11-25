'use client';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useConsent } from '@/lib/tracking/consent';
import { captureAttribution } from '@/lib/tracking/attribution';
import { GA4_ID, META_PIXEL_ID } from '@/lib/tracking/events';

const PIXEL_ID = /^\d{10,20}$/.test(META_PIXEL_ID) ? META_PIXEL_ID : '';
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(GA4_ID) ? GA4_ID : '';

const pixelBootstrap = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;
n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');fbq('track','PageView');`;

const gaBootstrap = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`;

/**
 * Loads Meta Pixel and GA4 only after the visitor allows them, sends a page view on every
 * navigation and remembers the campaign (UTM, fbclid, gclid) the visitor arrived with.
 */
export function TrackingScripts() {
  const pathname = usePathname(),
    consent = useConsent(),
    marketing = Boolean(PIXEL_ID && consent?.marketing),
    analytics = Boolean(GA_ID && consent?.analytics),
    lastPage = useRef('');

  useEffect(() => {
    captureAttribution();
  }, [pathname]);

  useEffect(() => {
    if (!marketing && !analytics) return;
    const page = pathname + window.location.search,
      previous = lastPage.current;
    lastPage.current = page;
    // The bootstraps count the page they load on; after that, each client navigation.
    if (!previous || previous === page) return;
    if (marketing) window.fbq?.('track', 'PageView');
    if (analytics)
      window.gtag?.('event', 'page_view', {
        page_location: window.location.href,
        page_title: document.title,
      });
  }, [pathname, marketing, analytics]);

  return (
    <>
      {marketing && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {pixelBootstrap}
        </Script>
      )}
      {analytics && (
        <>
          <Script
            id="ga4-lib"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {gaBootstrap}
          </Script>
        </>
      )}
    </>
  );
}
