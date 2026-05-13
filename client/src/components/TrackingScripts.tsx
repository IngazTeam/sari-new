import { useEffect, useState } from 'react';

interface TrackingPixel {
  type: string;
  trackingId: string;
}

// SEC-01: Sanitize tracking IDs to prevent XSS via stored injection
// Only allow: alphanumeric, hyphens, underscores, dots, forward slashes (for GTM)
const sanitizeTrackingId = (id: string): string =>
  id.replace(/[^a-zA-Z0-9\-_.\/]/g, '').substring(0, 100);

// SEC-02: Validate pixel shape from localStorage to prevent cache poisoning
const isValidPixel = (p: unknown): p is TrackingPixel =>
  typeof p === 'object' && p !== null &&
  typeof (p as any).type === 'string' &&
  typeof (p as any).trackingId === 'string' &&
  (p as any).trackingId.length > 0 &&
  (p as any).trackingId.length <= 100;

const VALID_TYPES = new Set([
  'google_analytics', 'ga4', 'google_ads', 'facebook_pixel', 'meta_pixel',
  'snapchat_pixel', 'tiktok_pixel', 'twitter_pixel', 'google_tag_manager', 'gtm',
]);

/**
 * TrackingScripts — Loads tracking pixels from the admin SEO settings
 * and injects them into <head> dynamically.
 * Supports: Google Analytics, Google Ads, Meta Pixel, Snapchat, TikTok, Twitter/X, GTM
 */
export default function TrackingScripts() {
  const [pixels, setPixels] = useState<TrackingPixel[]>([]);

  useEffect(() => {
    // Load from localStorage cache first for instant page load
    const cached = localStorage.getItem('sari_tracking_pixels');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // SEC-02: Validate every item shape before using
          const valid = parsed.filter(isValidPixel).filter(p => VALID_TYPES.has(p.type));
          if (valid.length > 0) setPixels(valid);
        }
      } catch { /* ignore corrupted cache */ }
    }

    // Fetch fresh from public API
    fetch('/api/trpc/seo.getPublicTrackingCodes')
      .then((r) => r.json())
      .then((data) => {
        const result = data?.result?.data;
        if (Array.isArray(result) && result.length > 0) {
          // SEC-02: Validate before storing
          const valid = result.filter(isValidPixel).filter(p => VALID_TYPES.has(p.type));
          if (valid.length > 0) {
            setPixels(valid);
            localStorage.setItem('sari_tracking_pixels', JSON.stringify(valid));
          }
        }
      })
      .catch(() => { /* tracking should never block the app */ });
  }, []);

  useEffect(() => {
    if (pixels.length === 0) return;

    const injected: HTMLElement[] = [];

    const inject = (el: HTMLElement) => {
      document.head.appendChild(el);
      injected.push(el);
    };

    const makeScript = (id: string, content: string) => {
      const s = document.createElement('script');
      s.setAttribute('data-tracking', id);
      s.textContent = content;
      return s;
    };

    pixels.forEach(({ type, trackingId: rawId }) => {
      // SEC-01: Sanitize EVERY tracking ID before injection
      const trackingId = sanitizeTrackingId(rawId);
      if (!trackingId) return;

      switch (type) {
        case 'google_analytics':
        case 'ga4': {
          const ext = document.createElement('script');
          ext.async = true;
          ext.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
          ext.setAttribute('data-tracking', 'ga4');
          inject(ext);
          inject(makeScript('ga4-init', `
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            gtag('config','${trackingId}');
          `));
          break;
        }

        case 'google_ads': {
          if (!document.querySelector('script[data-tracking="ga4"]')) {
            const ext = document.createElement('script');
            ext.async = true;
            ext.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
            ext.setAttribute('data-tracking', 'gads');
            inject(ext);
          }
          inject(makeScript('gads-init', `
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('config','${trackingId}');
          `));
          break;
        }

        case 'facebook_pixel':
        case 'meta_pixel': {
          inject(makeScript('meta-pixel', `
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init','${trackingId}');
            fbq('track','PageView');
          `));
          break;
        }

        case 'snapchat_pixel': {
          inject(makeScript('snap-pixel', `
            (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?
            a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];
            var s='script';var r=t.createElement(s);r.async=!0;r.src=n;
            var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);
            })(window,document,'https://sc-static.net/scevent.min.js');
            snaptr('init','${trackingId}',{});
            snaptr('track','PAGE_VIEW');
          `));
          break;
        }

        case 'tiktok_pixel': {
          inject(makeScript('tiktok-pixel', `
            !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
            ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
            ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
            for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
            ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
            ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
            ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
            ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";
            o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];
            a.parentNode.insertBefore(o,a)};
            ttq.load('${trackingId}');
            ttq.page();
            }(window,document,'ttq');
          `));
          break;
        }

        case 'twitter_pixel': {
          inject(makeScript('twitter-pixel', `
            !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},
            s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
            a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
            twq('config','${trackingId}');
          `));
          break;
        }

        case 'google_tag_manager':
        case 'gtm': {
          inject(makeScript('gtm', `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${trackingId}');
          `));
          break;
        }
      }
    });

    return () => { injected.forEach((el) => el.remove()); };
  }, [pixels]);

  return null;
}
