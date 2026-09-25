import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { Colors } from '../constants';
import { CARD_FORM_URL, type CardFormData } from '../services/payments';

export interface CardFormReply {
  /** Clears the form for another card (after a decline or an error). */
  rebuild: boolean;
}

export interface CardPaymentFormProps {
  amount: number;
  /** Starts the form's e-mail field; the driver can change it. */
  email: string | null;
  /** Pays with what the form handed over, and says how the form goes on. */
  onSubmit: (form: CardFormData, deviceId: string | null) => Promise<CardFormReply>;
  /** Other ways to pay, shown when the form cannot load. */
  fallback?: React.ReactNode;
}

// Mercado Pago's form loads in a few seconds; past this it is not coming.
const READY_TIMEOUT_MS = 25_000;

const isFormPage = (url: string | undefined) => String(url || '').split(/[?#]/)[0] === CARD_FORM_URL;

function readForm(data: unknown): CardFormData | null {
  const form = data as Partial<CardFormData> | null;
  if (!form || typeof form.token !== 'string' || typeof form.payment_method_id !== 'string') return null;
  const identification = form.payer?.identification;
  return {
    token: form.token,
    payment_method_id: form.payment_method_id,
    issuer_id: typeof form.issuer_id === 'string' || typeof form.issuer_id === 'number' ? form.issuer_id : null,
    payer: {
      email: typeof form.payer?.email === 'string' ? form.payer.email : '',
      identification: identification && typeof identification.number === 'string'
        ? { type: String(identification.type || ''), number: identification.number }
        : undefined,
    },
  };
}

/**
 * Mercado Pago's card form (Card Payment Brick) on a page of our server, in a
 * WebView. The card numbers go from the form straight to Mercado Pago; the app
 * only gets the one-use token that pays the plan.
 */
export const CardPaymentForm: React.FC<CardPaymentFormProps> = ({ amount, email, onSubmit, fallback }) => {
  const web = useRef<WebView>(null);
  // Bumped to load the page again from scratch.
  const [load, setLoad] = useState(0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  // Bumped when the page clears the form for another card.
  const [rebuildTick, setRebuildTick] = useState(0);
  const submitting = useRef(false);
  const init = JSON.stringify({ amount, email: email || '' });

  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    setFailed(false);
  }, [load]);

  // A fresh page, and a form cleared for another card, must be ready in time.
  useEffect(() => {
    const timer = setTimeout(() => { if (!readyRef.current) setFailed(true); }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [load, rebuildTick]);

  const fail = useCallback(() => {
    if (!readyRef.current) setFailed(true);
  }, []);

  const reply = useCallback((result: CardFormReply) => {
    web.current?.injectJavaScript(`window.__rnResult && window.__rnResult(${JSON.stringify(result)});true;`);
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (!isFormPage(event.nativeEvent.url)) return;
    let message: { type?: string; data?: unknown; deviceId?: unknown; reason?: unknown };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    switch (message?.type) {
      case 'init_request':
        web.current?.injectJavaScript(`window.__ruInit && window.__ruInit(${init});true;`);
        break;
      case 'ready':
        readyRef.current = true;
        setReady(true);
        break;
      case 'rebuilding':
        readyRef.current = false;
        setReady(false);
        setRebuildTick((n) => n + 1);
        break;
      case 'error':
        // The page gave up on the form, also when clearing it for another card.
        setFailed(true);
        break;
      case 'brick_error':
        // Field validation also comes here; only a broken form is a failure.
        if (String(message.reason || '').startsWith('critical')) fail();
        break;
      case 'card_form': {
        const form = readForm(message.data);
        if (!form) { reply({ rebuild: true }); break; }
        if (submitting.current) break;
        submitting.current = true;
        const deviceId = typeof message.deviceId === 'string' ? message.deviceId : null;
        void onSubmit(form, deviceId)
          .catch((): CardFormReply => ({ rebuild: true }))
          .then((result) => {
            submitting.current = false;
            reply(result);
          });
        break;
      }
      default:
        break;
    }
  }, [fail, init, onSubmit, reply]);

  // Only the form page opens in the view; Mercado Pago's own frames load
  // inside it, and any other link opens in the browser.
  const onShouldStart = useCallback((request: ShouldStartLoadRequest) => {
    if (request.isTopFrame === false || isFormPage(request.url)) return true;
    if (/^https:\/\//i.test(request.url)) void Linking.openURL(request.url).catch(() => {});
    return false;
  }, []);

  if (failed) {
    return (
      <View style={f.failBox}>
        <AlertCircle size={28} color="#92400E" />
        <Text style={f.failTitle}>Não foi possível abrir o formulário do cartão</Text>
        <Text style={f.failTxt}>Confira sua internet e tente de novo, ou escolha outra forma de pagar.</Text>
        <TouchableOpacity style={f.retryBtn} onPress={() => setLoad((n) => n + 1)} activeOpacity={0.85} accessibilityRole="button">
          <RefreshCw size={17} color="#fff" />
          <Text style={f.retryTxt}>Tentar de novo</Text>
        </TouchableOpacity>
        {fallback}
      </View>
    );
  }

  return (
    <View style={f.wrap}>
      <WebView
        key={load}
        ref={web}
        source={{ uri: CARD_FORM_URL }}
        originWhitelist={['https://*', 'about:*']}
        injectedJavaScriptBeforeContentLoaded={`window.__RU_INIT=${init};true;`}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onError={fail}
        onHttpError={(event) => { if (isFormPage(event.nativeEvent.url)) fail(); }}
        onRenderProcessGone={() => setLoad((n) => n + 1)}
        onContentProcessDidTerminate={() => setLoad((n) => n + 1)}
        setSupportMultipleWindows={false}
        textZoom={100}
        bounces={false}
        overScrollMode="never"
        automaticallyAdjustContentInsets={false}
        keyboardDisplayRequiresUserAction={false}
        webviewDebuggingEnabled={__DEV__}
        style={f.web}
      />
      {!ready && (
        <View style={f.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={f.loadingTxt}>Carregando o formulário seguro do Mercado Pago…</Text>
        </View>
      )}
    </View>
  );
};

const f = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  web: { flex: 1, backgroundColor: '#fff' },
  loading: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
  },
  loadingTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280', textAlign: 'center' },
  failBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  failTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', textAlign: 'center' },
  failTxt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch',
    backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 15, marginTop: 8,
  },
  retryTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' },
});
