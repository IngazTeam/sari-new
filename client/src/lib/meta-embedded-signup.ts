declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (callback: (response: any) => void, options: Record<string, unknown>) => void;
    };
  }
}
let sdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
    const finish = () => {
      if (!window.FB) return reject(new Error('Meta SDK did not initialize'));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('Meta SDK failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Meta SDK failed to load')), { once: true });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function launchMetaEmbeddedSignup(): Promise<{ code: string; wabaId: string; phoneNumberId: string }> {
  const appId = String(import.meta.env.VITE_META_APP_ID || '');
  const configId = String(import.meta.env.VITE_META_CONFIG_ID || '');
  const graphVersion = String(import.meta.env.VITE_META_GRAPH_API_VERSION || 'v23.0');
  if (!appId || !configId || !/^v\d{2,3}\.\d$/.test(graphVersion)) {
    throw new Error('Meta Embedded Signup غير مهيأ لهذه البيئة');
  }
  await loadFacebookSdk(appId, graphVersion);

  let cleanup = () => {};
  const signupData = new Promise<{ wabaId: string; phoneNumberId: string }>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('انتهت مهلة ربط Meta')), 120_000);
    const listener = (event: MessageEvent) => {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'FINISH' && data.data?.waba_id && data.data?.phone_number_id) {
        resolve({ wabaId: String(data.data.waba_id), phoneNumberId: String(data.data.phone_number_id) });
      } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
        reject(new Error('لم يكتمل ربط Meta'));
      }
    };
    window.addEventListener('message', listener);
    cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', listener);
    };
  });
  const authCode = new Promise<string>((resolve, reject) => {
    window.FB!.login((response: any) => {
      const code = String(response?.authResponse?.code || '');
      if (code) resolve(code);
      else reject(new Error('Meta لم يرجع رمز تفويض صالحًا'));
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: '3' },
    });
  });

  try {
    const [code, data] = await Promise.all([authCode, signupData]);
    return { code, ...data };
  } finally {
    cleanup();
  }
}
