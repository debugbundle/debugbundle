interface ResourceProvider {
  name: string;
  role: "analytics" | "advertising" | "tag_manager" | "authentication";
  hosts: readonly string[];
  paths: readonly (string | RegExp)[];
}

// Recognition describes a script, never its importance to the application. Keep
// signatures anchored to documented hosts/paths; sources live in the resource spec.
const PROVIDERS: readonly ResourceProvider[] = [
  {
    name: "Google Tag Manager",
    role: "tag_manager",
    hosts: ["www.googletagmanager.com"],
    paths: ["/gtm.js"]
  },
  {
    name: "Google tag (Analytics / Ads)",
    role: "analytics",
    hosts: ["www.googletagmanager.com"],
    paths: ["/gtag/js"]
  },
  {
    name: "Google Analytics",
    role: "analytics",
    hosts: ["www.google-analytics.com", "ssl.google-analytics.com"],
    paths: ["/analytics.js", "/ga.js"]
  },
  {
    name: "Meta Pixel",
    role: "advertising",
    hosts: ["connect.facebook.net"],
    paths: [/^\/[a-z]{2}_[A-Z]{2}\/fbevents\.js$/]
  },
  {
    name: "Microsoft Clarity",
    role: "analytics",
    hosts: ["www.clarity.ms"],
    paths: [/^\/tag\/[A-Za-z0-9]+$/]
  },
  {
    name: "Hotjar",
    role: "analytics",
    hosts: ["static.hotjar.com"],
    paths: [/^\/c\/hotjar-[0-9]+\.js$/]
  },
  {
    name: "Cloudflare Web Analytics",
    role: "analytics",
    hosts: ["static.cloudflareinsights.com"],
    paths: ["/beacon.min.js"]
  },
  {
    name: "Yandex Metrica",
    role: "analytics",
    hosts: ["mc.yandex.ru", "mc.yandex.com"],
    paths: ["/metrika/tag.js"]
  },
  {
    name: "WordPress.com / Jetpack Stats",
    role: "analytics",
    hosts: ["stats.wp.com"],
    paths: [/^\/e-[0-9]{6}\.js$/]
  },
  {
    name: "Microsoft Advertising UET",
    role: "advertising",
    hosts: ["bat.bing.com"],
    paths: ["/bat.js"]
  },
  {
    name: "LinkedIn Insight",
    role: "advertising",
    hosts: ["snap.licdn.com"],
    paths: ["/li.lms-analytics/insight.min.js"]
  },
  {
    name: "TikTok Pixel",
    role: "advertising",
    hosts: ["analytics.tiktok.com"],
    paths: ["/i18n/pixel/events.js"]
  },
  { name: "Pinterest Tag", role: "advertising", hosts: ["s.pinimg.com"], paths: ["/ct/core.js"] },
  {
    name: "X Pixel",
    role: "advertising",
    hosts: ["static.ads-twitter.com", "platform.twitter.com"],
    paths: ["/uwt.js", "/oct.js"]
  },
  {
    name: "Segment",
    role: "analytics",
    hosts: ["cdn.segment.com"],
    paths: [/^\/analytics\.js\/v1\/[A-Za-z0-9_-]+\/analytics\.min\.js$/]
  },
  {
    name: "Mixpanel",
    role: "analytics",
    hosts: ["cdn.mxpnl.com"],
    paths: ["/libs/mixpanel-2-latest.min.js", "/libs/mixpanel-js/dist/mixpanel.module.js"]
  },
  {
    name: "Amplitude",
    role: "analytics",
    hosts: ["cdn.amplitude.com"],
    paths: [
      /^\/libs\/analytics-browser-[0-9]+\.[0-9]+\.[0-9]+-min\.js(?:\.gz)?$/,
      /^\/script\/[A-Za-z0-9_-]+\.js$/
    ]
  },
  {
    name: "PostHog",
    role: "analytics",
    hosts: ["us-assets.i.posthog.com", "eu-assets.i.posthog.com", "app.posthog.com"],
    paths: ["/static/array.js"]
  },
  {
    name: "Plausible",
    role: "analytics",
    hosts: ["plausible.io"],
    paths: [/^\/js\/pa-[A-Za-z0-9_-]+\.js$/, /^\/js\/script(?:\.[a-z-]+)*\.js$/]
  },
  {
    name: "Google sign-in",
    role: "authentication",
    hosts: ["accounts.google.com"],
    paths: ["/gsi/client"]
  }
];

export function identifyBrowserResourceProvider(
  host: string | null,
  path: string
): ResourceProvider | null {
  if (host === null) return null;
  return (
    PROVIDERS.find(
      (provider) =>
        provider.hosts.includes(host) &&
        provider.paths.some((pattern) =>
          typeof pattern === "string" ? path === pattern : pattern.test(path)
        )
    ) ?? null
  );
}
