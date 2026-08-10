import fs from 'fs';
import path from 'path';

export function landingPage(opts = {}) {
  const metaPixelId = String(opts.metaPixelId || process.env.META_PIXEL_ID || '1057949890036873').replace(/\D/g, '');
  const metaPixelHead = metaPixelId ? `
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');
</script>` : '';
  const metaPixelNoScript = metaPixelId ? `
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1"
/></noscript>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Rotta Urbana — A Revolução da Mobilidade Urbana</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Rotta Urbana: Mais economia para o passageiro, lucro de verdade para o motorista. Sem taxas abusivas, pagamento instantâneo via PIX.">
<link rel="icon" type="image/png" href="/assets/logo.png">
${metaPixelHead}
<script>
  window.__ADMIN_SETTINGS__ = ${JSON.stringify(opts.settings || {})};
  window.__ADMIN_FARES__ = ${JSON.stringify(opts.fares || [])};
</script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="/support.js"></script>
</head>
<body>
${metaPixelNoScript}
<x-dc>

<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    html{ scroll-behavior:smooth; }
    body{ margin:0; background:#F7F8F6; }
    a{ color:#279A0A; }
    a:hover{ color:#48D10A; }
    ::selection{ background:#48D10A; color:#0B0C0D; }
    input::placeholder, textarea::placeholder{ color:#9AA09A; }

    @media (max-width: 900px) {
      .hero-bg-section {
        background-position: 85% center !important;
        min-height: auto !important;
        padding-top: 20px !important;
        padding-bottom: 40px !important;
      }
      .hero-overlay {
        background: linear-gradient(180deg, rgba(247,248,246,0.96) 0%, rgba(247,248,246,0.92) 70%, rgba(247,248,246,0.85) 100%) !important;
      }
      .hero-content-box {
        max-width: 100% !important;
        width: 100% !important;
        min-width: 100% !important;
      }
      .hero-store-buttons {
        flex-direction: column !important;
        width: 100% !important;
      }
      .hero-store-btn {
        flex: 1 1 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .hero-stats-row {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6px !important;
        padding-top: 16px !important;
        width: 100% !important;
      }
      .hero-stat-item {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        padding: 0 4px !important;
        border-right: 1px solid rgba(11,12,13,0.15) !important;
      }
      .hero-stat-item:last-child {
        border-right: none !important;
      }
      .hero-stat-item img {
        width: 18px !important;
        height: 18px !important;
        margin-bottom: 4px !important;
      }
      .hero-stat-val {
        font-size: 13.5px !important;
        font-weight: 800 !important;
        color: #0B0C0D !important;
        line-height: 1.1 !important;
      }
      .hero-stat-lbl {
        font-size: 10px !important;
        color: #646A64 !important;
        line-height: 1.2 !important;
        margin-top: 2px !important;
      }
    }
  </style>
</helmet>

<div style="font-family:'Inter',sans-serif; color:#1A1C1F; background:#F7F8F6; overflow-x:hidden;">

  <!-- HEADER -->
  <sc-if value="{{ wide }}" hint-placeholder-val="{{ true }}">
  <header style="position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; gap:clamp(12px,2vw,24px); flex-wrap:wrap; padding:12px clamp(16px,4vw,56px); background:rgba(255,255,255,0.94); backdrop-filter:blur(10px); border-bottom:1px solid #E3E6E1;">
    <a href="#topo" style="display:flex; align-items:center; flex:0 0 auto;">
      <img src="/assets/logo.png" alt="Rotta Urbana" style="height:clamp(46px,5vw,64px); width:auto; object-fit:contain; filter:brightness(0.3) saturate(1.6);" />
    </a>
    <nav style="display:flex; align-items:center; gap:clamp(14px,2.2vw,34px); flex:1 1 auto; justify-content:center; flex-wrap:wrap;">
      <a href="#passageiro" style="font-family:'Inter',sans-serif; font-weight:600; font-size:15px; color:#1A1C1F; text-decoration:none; white-space:nowrap;" style-hover="color:#279A0A;">Passageiro</a>
      <a href="#motorista" style="font-family:'Inter',sans-serif; font-weight:600; font-size:15px; color:#1A1C1F; text-decoration:none; white-space:nowrap;" style-hover="color:#279A0A;">Motorista</a>
      <a href="#planos" style="font-family:'Inter',sans-serif; font-weight:600; font-size:15px; color:#1A1C1F; text-decoration:none; white-space:nowrap;" style-hover="color:#279A0A;">Planos</a>
      <a href="#contato" style="font-family:'Inter',sans-serif; font-weight:600; font-size:15px; color:#1A1C1F; text-decoration:none; white-space:nowrap;" style-hover="color:#279A0A;">Contato</a>
    </nav>
    <div style="display:flex; align-items:center; gap:10px; flex:0 0 auto;">
      <a href="#planos" style="display:flex; align-items:center; gap:8px; font-family:'Sora',sans-serif; font-weight:700; font-size:14px; color:#1A1C1F; text-decoration:none; padding:11px 18px; border-radius:8px; border:1.5px solid #E3E6E1; white-space:nowrap;" style-hover="border-color:#48D10A; color:#279A0A;">
        <img src="https://api.iconify.design/lucide/car.svg?color=%23279A0A&width=18" alt="" style="width:18px; height:18px; display:block;" />Seja motorista
      </a>
      <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" style="display:flex; align-items:center; gap:8px; font-family:'Sora',sans-serif; font-weight:700; font-size:14px; color:#0B0C0D; text-decoration:none; padding:12px 20px; border-radius:8px; background:#48D10A; white-space:nowrap;" style-hover="background:#63F21B;">
        <img src="https://api.iconify.design/lucide/download.svg?color=%230B0C0D&width=18" alt="" style="width:18px; height:18px; display:block;" />Baixar o app
      </a>
    </div>
  </header>
  </sc-if>

  <sc-if value="{{ narrow }}" hint-placeholder-val="{{ false }}">
    <header style="position:sticky; top:0; z-index:60; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 18px; background:#FFFFFF; border-bottom:1px solid #E3E6E1;">
      <a href="#topo" onClick="{{ closeMenu }}" style="display:flex; align-items:center;">
        <img src="/assets/logo.png" alt="Rotta Urbana" style="height:46px; width:auto; object-fit:contain; filter:brightness(0.3) saturate(1.6);" />
      </a>
      <button type="button" onClick="{{ toggleMenu }}" aria-label="Abrir menu" style="width:46px; height:46px; flex:0 0 46px; border-radius:12px; border:1.5px solid #E3E6E1; background:#FFFFFF; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;">
        <sc-if value="{{ menuClosed }}" hint-placeholder-val="{{ true }}"><img src="https://api.iconify.design/lucide/menu.svg?color=%230B0C0D&width=24" alt="" style="width:24px; height:24px; display:block;" /></sc-if>
        <sc-if value="{{ menuOpen }}" hint-placeholder-val="{{ false }}"><img src="https://api.iconify.design/lucide/x.svg?color=%230B0C0D&width=24" alt="" style="width:24px; height:24px; display:block;" /></sc-if>
      </button>
    </header>
    <sc-if value="{{ menuOpen }}" hint-placeholder-val="{{ false }}">
      <div style="position:sticky; top:67px; z-index:59; background:#FFFFFF; border-bottom:1px solid #E3E6E1; padding:6px 18px 20px 18px; display:flex; flex-direction:column; box-shadow:0 18px 34px rgba(11,12,13,0.08);">
        <a href="#passageiro" onClick="{{ closeMenu }}" style="display:block; padding:15px 4px; font-family:'Inter',sans-serif; font-weight:600; font-size:16px; color:#1A1C1F; text-decoration:none; border-bottom:1px solid #EDEFEA;">Passageiro</a>
        <a href="#motorista" onClick="{{ closeMenu }}" style="display:block; padding:15px 4px; font-family:'Inter',sans-serif; font-weight:600; font-size:16px; color:#1A1C1F; text-decoration:none; border-bottom:1px solid #EDEFEA;">Motorista</a>
        <a href="#planos" onClick="{{ closeMenu }}" style="display:block; padding:15px 4px; font-family:'Inter',sans-serif; font-weight:600; font-size:16px; color:#1A1C1F; text-decoration:none; border-bottom:1px solid #EDEFEA;">Planos</a>
        <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" onClick="{{ closeMenu }}" style="display:block; padding:15px 4px; font-family:'Inter',sans-serif; font-weight:600; font-size:16px; color:#1A1C1F; text-decoration:none; border-bottom:1px solid #EDEFEA;">Baixar o app</a>
        <a href="#contato" onClick="{{ closeMenu }}" style="display:block; padding:15px 4px; font-family:'Inter',sans-serif; font-weight:600; font-size:16px; color:#1A1C1F; text-decoration:none; border-bottom:1px solid #EDEFEA;">Contato</a>
        <a href="#planos" onClick="{{ closeMenu }}" style="display:flex; align-items:center; justify-content:center; gap:9px; margin-top:16px; padding:16px 20px; border-radius:11px; border:1.5px solid #E3E6E1; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#1A1C1F; text-decoration:none;">
          <img src="https://api.iconify.design/mdi/steering.svg?color=%23279A0A&width=19" alt="" style="width:19px; height:19px; display:block;" />Seja motorista
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" onClick="{{ closeMenu }}" style="display:flex; align-items:center; justify-content:center; gap:9px; margin-top:10px; padding:16px 20px; border-radius:11px; background:#48D10A; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D; text-decoration:none;">
          <img src="https://api.iconify.design/lucide/download.svg?color=%230B0C0D&width=19" alt="" style="width:19px; height:19px; display:block;" />Baixar o app
        </a>
      </div>
    </sc-if>
  </sc-if>

  <!-- HERO -->
  <section id="topo" class="hero-bg-section" style="position:relative; background-image:url('/assets/hero-banner.png'); background-size:cover; background-position:76% center; background-repeat:no-repeat; background-color:#F7F8F6; min-height:min(740px,84vh); display:flex; align-items:center; scroll-margin-top:80px;">
    <div class="hero-overlay" style="position:absolute; inset:0; background:linear-gradient(90deg, #F7F8F6 0%, rgba(247,248,246,0.96) 30%, rgba(247,248,246,0.5) 54%, rgba(247,248,246,0) 70%), linear-gradient(180deg, rgba(247,248,246,0.82) 0%, rgba(247,248,246,0.35) 45%, rgba(247,248,246,0) 100%);"></div>
    <div style="position:relative; z-index:2; width:100%; max-width:1400px; margin:0 auto; padding:clamp(32px,7vw,96px) clamp(16px,4vw,56px);">
      <div class="hero-content-box" style="max-width:min(600px,62%); min-width:min(100%,300px); display:flex; flex-direction:column; gap:22px;">
        <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:100px; background:rgba(72,209,10,0.14); width:fit-content;">
          <img src="https://api.iconify.design/lucide/zap.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" />
          <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; color:#279A0A; letter-spacing:0.06em;">MOBILIDADE URBANA INTELIGENTE</span>
        </div>
        <h1 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(30px,4vw,54px); line-height:1.06; margin:0; color:#0B0C0D; letter-spacing:-0.02em; text-wrap:balance;">
          A revolução da mobilidade urbana chegou
        </h1>
        <p style="font-family:'Inter',sans-serif; font-size:clamp(15px,1.15vw,18px); line-height:1.6; color:#4E534E; margin:0; max-width:480px; text-wrap:pretty;">
          Mais economia para o passageiro, lucro de verdade para o motorista. Sem taxas abusivas, sem tarifas surpresa — com pagamento instantâneo via PIX.
        </p>
        <div class="hero-store-buttons" style="display:flex; flex-wrap:wrap; gap:12px; margin-top:2px;">
          <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" class="hero-store-btn" style="display:inline-flex; align-items:center; justify-content:center; gap:10px; text-decoration:none; padding:12px 20px; border-radius:12px; background:#0B0C0D; box-shadow:0 8px 20px rgba(11,12,13,0.15); width:fit-content;" style-hover="background:#1A1C1F;">
            <img src="https://api.iconify.design/simple-icons/googleplay.svg?color=%2363F21B&width=20" alt="" style="width:20px; height:20px; display:block;" />
            <span style="display:flex; flex-direction:column; line-height:1.15;">
              <span style="font-family:'Inter',sans-serif; font-size:10.5px; color:#C7CBC5;">Disponível no</span>
              <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:14.5px; color:#FFFFFF;">Google Play</span>
            </span>
          </a>
          <a href="#baixar" class="hero-store-btn" style="display:inline-flex; align-items:center; justify-content:center; gap:10px; text-decoration:none; padding:12px 20px; border-radius:12px; background:#0B0C0D; box-shadow:0 8px 20px rgba(11,12,13,0.15); width:fit-content;" style-hover="background:#1A1C1F;" onclick="alert('Versão iOS disponível em breve!'); return false;">
            <img src="https://api.iconify.design/simple-icons/apple.svg?color=%23FFFFFF&width=20" alt="" style="width:20px; height:20px; display:block;" />
            <span style="display:flex; flex-direction:column; line-height:1.15;">
              <span style="font-family:'Inter',sans-serif; font-size:10.5px; color:#C7CBC5;">Baixe na</span>
              <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:14.5px; color:#FFFFFF;">App Store</span>
            </span>
          </a>
        </div>
        
        <!-- 3 Stats Items Side-by-Side with dividers on Mobile -->
        <div class="hero-stats-row" style="display:flex; flex-wrap:wrap; gap:clamp(18px,3vw,40px); margin-top:12px; padding-top:22px; border-top:1px solid rgba(11,12,13,0.1);">
          <div class="hero-stat-item" style="display:flex; align-items:center; gap:10px;">
            <img src="https://api.iconify.design/lucide/trending-down.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block;" />
            <div>
              <div class="hero-stat-val" style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">Até 40%</div>
              <div class="hero-stat-lbl" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64;">menos taxas</div>
            </div>
          </div>
          <div class="hero-stat-item" style="display:flex; align-items:center; gap:10px;">
            <img src="https://api.iconify.design/simple-icons/pix.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block;" />
            <div>
              <div class="hero-stat-val" style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">PIX</div>
              <div class="hero-stat-lbl" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64;">instantâneo</div>
            </div>
          </div>
          <div class="hero-stat-item" style="display:flex; align-items:center; gap:10px;">
            <img src="https://api.iconify.design/lucide/shield-check.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block;" />
            <div>
              <div class="hero-stat-val" style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">24/7</div>
              <div class="hero-stat-lbl" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64;">suporte</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- PROBLEMA VS SOLUCAO -->
  <section style="padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); max-width:1300px; margin:0 auto;">
    <div style="text-align:center; margin-bottom:clamp(32px,4vw,56px); display:flex; flex-direction:column; gap:12px; align-items:center;">
      <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">O problema vs. a solução</div>
      <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(26px,3.2vw,40px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Chega de pagar mais e ganhar menos</h2>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:24px;">
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,3vw,40px); display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="https://api.iconify.design/lucide/ban.svg?color=%23E5484D&width=20" alt="" style="width:20px; height:20px; display:block;" />
          <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#E5484D; text-transform:uppercase; letter-spacing:0.06em;">O mercado atual</span>
        </div>
        <p style="font-family:'Inter',sans-serif; font-size:16px; line-height:1.7; color:#646A64; margin:0; text-wrap:pretty;">
          Os aplicativos tradicionais de transporte estão sufocando o mercado. Passageiros pagam tarifas absurdas por causa do preço dinâmico, e motoristas deixam até 30% a 40% do seu faturamento nas mãos de plataformas multinacionais.
        </p>
      </div>
      <div style="background:#0B0C0D; border-radius:18px; padding:clamp(24px,3vw,40px); display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="https://api.iconify.design/lucide/sparkles.svg?color=%2363F21B&width=20" alt="" style="width:20px; height:20px; display:block;" />
          <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#63F21B; text-transform:uppercase; letter-spacing:0.06em;">A solução Rotta Urbana</span>
        </div>
        <p style="font-family:'Inter',sans-serif; font-size:16px; line-height:1.7; color:#E3E6E1; margin:0; text-wrap:pretty;">
          Nascemos para restabelecer a justiça no transporte por aplicativo. Um ecossistema inteligente, seguro e rentável, onde o passageiro economiza em cada viagem e o motorista parceiro fica com a maior fatia do seu esforço.
        </p>
      </div>
    </div>
  </section>

  <!-- O QUE O SISTEMA FAZ -->
  <section style="padding:0 clamp(16px,4vw,56px) clamp(56px,8vw,110px) clamp(16px,4vw,56px); max-width:1300px; margin:0 auto;">
    <div style="text-align:center; margin-bottom:clamp(32px,4vw,56px); display:flex; flex-direction:column; gap:12px; align-items:center;">
      <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">Tecnologia &amp; funcionalidades</div>
      <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(26px,3.2vw,40px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Uma plataforma completa de mobilidade</h2>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:24px;">
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/smartphone.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:19px; color:#0B0C0D;">App do Passageiro</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="https://api.iconify.design/simple-icons/android.svg?color=%23646A64&width=15" alt="" style="width:15px; height:15px; display:block;" />
          <img src="https://api.iconify.design/simple-icons/apple.svg?color=%23646A64&width=14" alt="" style="width:14px; height:14px; display:block;" />
          <span style="font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:#646A64; letter-spacing:0.04em;">Android &amp; iOS</span>
        </div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">Interface ultrarrápida para solicitar carros e motos em segundos, ver a rota ao vivo, calcular tarifas fixas e pagar via PIX ou cartão.</p>
      </div>
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/car.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:19px; color:#0B0C0D;">App do Motorista</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="https://api.iconify.design/lucide/chart-column.svg?color=%23646A64&width=15" alt="" style="width:15px; height:15px; display:block;" />
          <span style="font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:#646A64; letter-spacing:0.04em;">Painel de ganhos</span>
        </div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">Aceitação de corridas, escolha de rotas favoráveis, saques automáticos via PIX e relatórios de rendimento em tempo real.</p>
      </div>
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/shield-check.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:19px; color:#0B0C0D;">Gestão &amp; Segurança</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="https://api.iconify.design/lucide/clock.svg?color=%23646A64&width=15" alt="" style="width:15px; height:15px; display:block;" />
          <span style="font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:#646A64; letter-spacing:0.04em;">Monitoramento 24/7</span>
        </div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">Verificação rigorosa de documentos (KYC), botão de emergência, monitoramento ao vivo e canal de suporte humanizado.</p>
      </div>
    </div>
  </section>

  <!-- PASSAGEIRO -->
  <section id="passageiro" style="background:#FFFFFF; padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); border-top:1px solid #E3E6E1; border-bottom:1px solid #E3E6E1; scroll-margin-top:74px;">
    <div style="max-width:1300px; margin:0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:clamp(28px,4vw,64px);">
      <div style="flex:1 1 360px; min-width:min(100%,280px);">
        <img src="/assets/passageira.png" alt="Passageira usando o app Rotta Urbana" style="width:100%; height:clamp(280px,40vw,520px); object-fit:cover; border-radius:20px; display:block;" />
      </div>
      <div style="flex:1 1 400px; min-width:min(100%,280px); display:flex; flex-direction:column; gap:18px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">Para passageiros</div>
        <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(24px,2.6vw,36px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Sua viagem, no seu ritmo e no seu bolso</h2>
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/lucide/trending-down.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Sem tarifas abusivas.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Esqueça o susto do preço dinâmico multiplicando o valor da sua corrida nos horários de pico.</span></div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/lucide/shield-check.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Segurança em primeiro lugar.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Acompanhamento GPS ao vivo, verificação de motoristas e compartilhamento da rota em tempo real com quem você ama.</span></div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/lucide/bike.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Carro ou moto em segundos.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Escolha a categoria ideal para a sua pressa ou para o seu conforto.</span></div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/simple-icons/pix.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Pagamento prático e rápido.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Pague via PIX direto no app ou no cartão, sem complicação.</span></div>
          </div>
        </div>
        <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" style="display:flex; align-items:center; gap:9px; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D; text-decoration:none; padding:15px 24px; border-radius:10px; background:#48D10A; width:min(100%,340px); justify-content:center; margin-top:6px;" style-hover="background:#63F21B;">
          <img src="https://api.iconify.design/lucide/download.svg?color=%230B0C0D&width=19" alt="" style="width:19px; height:19px; display:block;" />Baixar o app do passageiro
        </a>
      </div>
    </div>
  </section>

  <!-- MOTORISTA -->
  <section id="motorista" style="padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); scroll-margin-top:74px;">
    <div style="max-width:1300px; margin:0 auto; display:flex; flex-wrap:wrap-reverse; align-items:center; gap:clamp(28px,4vw,64px);">
      <div style="flex:1 1 400px; min-width:min(100%,280px); display:flex; flex-direction:column; gap:18px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">Para motoristas</div>
        <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(24px,2.6vw,36px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Chega de trabalhar para o app. Trabalhe para você!</h2>
        <p style="font-family:'Inter',sans-serif; font-size:16px; line-height:1.7; color:#646A64; margin:0; text-wrap:pretty;">
          No Rotta Urbana, você não é apenas um número. Você escolhe seu tempo, sua rota e fica com o dinheiro que realmente merece.
        </p>
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/simple-icons/pix.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Saques instantâneos via PIX.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">O dinheiro da sua corrida cai na conta sem esperar dias ou pagar taxas extras.</span></div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/lucide/route.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">Você escolhe as corridas.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Rotas favoráveis, horários flexíveis e relatórios claros de rendimento.</span></div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <img src="https://api.iconify.design/lucide/wallet.svg?color=%2348D10A&width=22" alt="" style="width:22px; height:22px; display:block; flex:0 0 22px; margin-top:2px;" />
            <div style="font-size:15px; line-height:1.65;"><span style="font-family:'Sora',sans-serif; font-weight:700; color:#0B0C0D;">A maior fatia é sua.</span> <span style="font-family:'Inter',sans-serif; color:#646A64;">Planos com taxa fixa ou passe livre — você decide quanto pagar pela plataforma.</span></div>
          </div>
        </div>
        <a href="#planos" style="display:flex; align-items:center; gap:9px; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#1A1C1F; text-decoration:none; padding:15px 24px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; width:min(100%,340px); justify-content:center; margin-top:6px;" style-hover="border-color:#48D10A; color:#279A0A;">
          <img src="https://api.iconify.design/lucide/car.svg?color=%23279A0A&width=19" alt="" style="width:19px; height:19px; display:block;" />Quero ser Motorista Parceiro
        </a>
      </div>
      <div style="flex:1 1 360px; min-width:min(100%,280px);">
        <img src="/assets/motorista.png" alt="Motorista parceiro Rotta Urbana" style="width:100%; height:clamp(280px,40vw,520px); object-fit:cover; border-radius:20px; display:block;" />
      </div>
    </div>
  </section>

  <!-- PLANOS -->
  <section id="planos" style="background:#0B0C0D; padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); scroll-margin-top:74px;">
    <div style="max-width:1300px; margin:0 auto;">
      <div style="text-align:center; margin-bottom:clamp(36px,4.5vw,60px); display:flex; flex-direction:column; gap:12px; align-items:center;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#63F21B; text-transform:uppercase;">Planos &amp; valores</div>
        <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(26px,3.2vw,40px); line-height:1.15; color:#FFFFFF; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Escolha o seu modelo de lucro</h2>
        <p style="font-family:'Inter',sans-serif; font-size:16px; color:#8A9088; margin:0; max-width:520px;">Sem letra miúda: você paga só pelo modelo que combina com a sua rotina nas ruas.</p>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px;">
        <sc-for list="{{ plans }}" as="plan" hint-placeholder-count="4">
          <div style="background:{{ plan.bg }}; border:1.5px solid {{ plan.border }}; border-radius:18px; padding:32px 26px 28px 26px; display:flex; flex-direction:column; gap:14px; position:relative;">
            <sc-if value="{{ plan.badge }}" hint-placeholder-val="{{ false }}">
              <span style="position:absolute; top:-12px; left:26px; display:flex; align-items:center; gap:6px; background:#48D10A; color:#0B0C0D; font-family:'Sora',sans-serif; font-weight:800; font-size:11px; letter-spacing:0.06em; padding:5px 12px; border-radius:100px; text-transform:uppercase;">
                <img src="https://api.iconify.design/lucide/star.svg?color=%230B0C0D&width=12" alt="" style="width:12px; height:12px; display:block;" />Mais vendido
              </span>
            </sc-if>
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:18px; color:#FFFFFF;">{{ plan.name }}</div>
            <div style="display:flex; align-items:baseline; gap:6px; padding-bottom:14px; border-bottom:1px solid #232527; flex-wrap:wrap;">
              <span style="font-family:'Sora',sans-serif; font-weight:800; font-size:26px; color:#63F21B; line-height:1.1;">{{ plan.price }}</span>
              <span style="font-family:'Inter',sans-serif; font-size:13px; color:#8A9088;">{{ plan.unit }}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:flex-start;">
              <img src="https://api.iconify.design/lucide/users.svg?color=%238A9088&width=16" alt="" style="width:16px; height:16px; display:block; flex:0 0 16px; margin-top:2px;" />
              <div style="font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#C7CBC5; line-height:1.5;">{{ plan.audience }}</div>
            </div>
            <p style="font-family:'Inter',sans-serif; font-size:14px; line-height:1.65; color:#8A9088; margin:0; flex:1; text-wrap:pretty;">{{ plan.benefit }}</p>
            <a href="#contato" style="display:flex; align-items:center; justify-content:center; gap:8px; font-family:'Sora',sans-serif; font-weight:700; font-size:14px; text-decoration:none; padding:13px 18px; border-radius:9px; background:{{ plan.ctaBg }}; color:{{ plan.ctaColor }}; border:1.5px solid {{ plan.ctaBorder }};">
              Escolher plano
              <sc-if value="{{ plan.badge }}" hint-placeholder-val="{{ false }}"><img src="https://api.iconify.design/lucide/arrow-right.svg?color=%230B0C0D&width=16" alt="" style="width:16px; height:16px; display:block;" /></sc-if>
              <sc-if value="{{ plan.plain }}" hint-placeholder-val="{{ true }}"><img src="https://api.iconify.design/lucide/arrow-right.svg?color=%23FFFFFF&width=16" alt="" style="width:16px; height:16px; display:block;" /></sc-if>
            </a>
          </div>
        </sc-for>
      </div>

      <!-- TABELA DE TARIFAS LOCAIS DE CORRIDA -->
      <div style="margin-top:48px; background:#141618; border:1.5px solid #232628; border-radius:20px; padding:clamp(24px,3vw,36px);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; border-bottom:1px solid #232628; padding-bottom:16px;">
          <div>
            <h3 style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#FFFFFF; margin:0;">Tarifas Locais de Corrida por Categoria</h3>
            <p style="font-family:'Inter',sans-serif; font-size:13.5px; color:#8A9088; margin:4px 0 0 0;">Valores base, custo por KM / minuto e tarifa mínima cobrados nas viagens na cidade.</p>
          </div>
          <span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:100px; background:rgba(99,242,27,0.12); color:#63F21B; font-family:'Sora',sans-serif; font-weight:700; font-size:12px;">
            <img src="https://api.iconify.design/lucide/check-circle.svg?color=%2363F21B&width=14" alt="" style="width:14px; height:14px; display:block;" /> 100% Transparente
          </span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px;">
          <div style="background:#1C1F22; border:1px solid #2A2E32; border-radius:14px; padding:18px;">
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:16px; color:#48D10A; margin-bottom:12px;">Moto</div>
            <div style="display:flex; flex-direction:column; gap:8px; font-family:'Inter',sans-serif; font-size:13px; color:#C7CBC5;">
              <div style="display:flex; justify-content:space-between;"><span>Bandeirada (Base):</span><strong>R$ 3,50</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por KM:</span><strong>R$ 1,80</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por Minuto:</span><strong>R$ 0,30</strong></div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid #2E3338; padding-top:6px; margin-top:2px;"><span style="color:#FFFFFF; font-weight:600;">Tarifa Mínima:</span><strong style="color:#63F21B;">R$ 7,00</strong></div>
            </div>
          </div>

          <div style="background:#1C1F22; border:1px solid #2A2E32; border-radius:14px; padding:18px;">
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:16px; color:#3B82F6; margin-bottom:12px;">Econômico (Smart)</div>
            <div style="display:flex; flex-direction:column; gap:8px; font-family:'Inter',sans-serif; font-size:13px; color:#C7CBC5;">
              <div style="display:flex; justify-content:space-between;"><span>Bandeirada (Base):</span><strong>R$ 4,50</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por KM:</span><strong>R$ 2,20</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por Minuto:</span><strong>R$ 0,35</strong></div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid #2E3338; padding-top:6px; margin-top:2px;"><span style="color:#FFFFFF; font-weight:600;">Tarifa Mínima:</span><strong style="color:#63F21B;">R$ 9,00</strong></div>
            </div>
          </div>

          <div style="background:#1C1F22; border:1px solid #2A2E32; border-radius:14px; padding:18px;">
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:16px; color:#F59E0B; margin-bottom:12px;">Conforto</div>
            <div style="display:flex; flex-direction:column; gap:8px; font-family:'Inter',sans-serif; font-size:13px; color:#C7CBC5;">
              <div style="display:flex; justify-content:space-between;"><span>Bandeirada (Base):</span><strong>R$ 6,00</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por KM:</span><strong>R$ 2,80</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por Minuto:</span><strong>R$ 0,45</strong></div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid #2E3338; padding-top:6px; margin-top:2px;"><span style="color:#FFFFFF; font-weight:600;">Tarifa Mínima:</span><strong style="color:#63F21B;">R$ 12,00</strong></div>
            </div>
          </div>

          <div style="background:#1C1F22; border:1px solid #2A2E32; border-radius:14px; padding:18px;">
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:16px; color:#8B5CF6; margin-bottom:12px;">Premium</div>
            <div style="display:flex; flex-direction:column; gap:8px; font-family:'Inter',sans-serif; font-size:13px; color:#C7CBC5;">
              <div style="display:flex; justify-content:space-between;"><span>Bandeirada (Base):</span><strong>R$ 9,00</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por KM:</span><strong>R$ 3,80</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Valor por Minuto:</span><strong>R$ 0,60</strong></div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid #2E3338; padding-top:6px; margin-top:2px;"><span style="color:#FFFFFF; font-weight:600;">Tarifa Mínima:</span><strong style="color:#63F21B;">R$ 18,00</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- DIFERENCIAIS -->
  <section style="padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); max-width:1300px; margin:0 auto;">
    <div style="text-align:center; margin-bottom:clamp(32px,4vw,56px); display:flex; flex-direction:column; gap:12px; align-items:center;">
      <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">Diferenciais</div>
      <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(26px,3.2vw,40px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">O que convence quem já roda com a gente</h2>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:24px;">
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:12px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/zap.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">Saques instantâneos</div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">O dinheiro da sua corrida cai na sua conta via PIX, sem esperar dias nem pagar taxas extras de transferência.</p>
      </div>
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:12px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/headphones.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">Suporte humanizado</div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">Chega de conversar com robôs. Nossa equipe atende você de verdade, sempre que precisar.</p>
      </div>
      <div style="background:#FFFFFF; border:1.5px solid #E3E6E1; border-radius:18px; padding:clamp(24px,2.6vw,34px); display:flex; flex-direction:column; gap:12px;">
        <div style="width:48px; height:48px; border-radius:12px; background:rgba(72,209,10,0.12); display:flex; align-items:center; justify-content:center;">
          <img src="https://api.iconify.design/lucide/shield-check.svg?color=%23279A0A&width=24" alt="" style="width:24px; height:24px; display:block;" />
        </div>
        <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:20px; color:#0B0C0D;">Segurança &amp; seguro</div>
        <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.65; color:#646A64; margin:0; text-wrap:pretty;">Proteção ativa para motoristas e passageiros durante todo o trajeto, com monitoramento 24 horas.</p>
      </div>
    </div>
  </section>

  <!-- ESCOLHA: PASSAGEIRO OU MOTORISTA -->
  <section id="baixar" style="background:radial-gradient(circle at 50% 40%, rgba(61,214,25,0.035), transparent 55%), #F7F8F7; padding:70px 24px 82px 24px; scroll-margin-top:74px;">
    <div style="width:100%; max-width:1250px; margin:0 auto;">
      <div style="display:flex; justify-content:center; align-items:center; gap:7px; margin-bottom:18px;">
        <span style="width:4px; height:4px; border-radius:50%; background:#A9E883;"></span>
        <span style="width:5px; height:5px; border-radius:50%; background:#7FDD4A;"></span>
        <span style="width:46px; height:5px; border-radius:100px; background:#48D10A;"></span>
        <span style="width:5px; height:5px; border-radius:50%; background:#7FDD4A;"></span>
      </div>
      <h2 style="margin:0; text-align:center; font-family:'Sora',sans-serif; font-size:42px; line-height:1.12; font-weight:700; letter-spacing:-1.3px; color:#151718;">Como você quer usar a Rotta Urbana?</h2>
      <p style="max-width:730px; margin:13px auto 0 auto; text-align:center; font-family:'Inter',sans-serif; font-size:17px; line-height:1.55; color:#667078;">Escolha a opção que melhor combina com você e aproveite todos os benefícios.</p>

      <sc-if value="{{ wide }}" hint-placeholder-val="{{ true }}">
      <div style="margin-top:38px; height:{{ cardsBoxH }}; display:flex; justify-content:center;">
      <div style="width:1250px; flex:0 0 1250px; transform:{{ cardsScale }}; transform-origin:top center; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:28px;">
        <div style="position:relative; box-sizing:border-box; height:316px; padding:32px 28px 30px 38px; background:rgba(255,255,255,0.96); border:1px solid #E7EBE6; border-radius:24px; box-shadow:0 18px 40px rgba(22,32,25,0.075), 0 2px 8px rgba(22,32,25,0.025); overflow:hidden;">
          <div style="position:absolute; top:30px; right:28px; width:214px; height:228px; z-index:2; clip-path:path('M 16 0 H 198 A 16 16 0 0 1 214 16 V 212 A 16 16 0 0 1 198 228 H 124 A 16 16 0 0 1 108 212 V 148 A 16 16 0 0 0 92 132 H 16 A 16 16 0 0 1 0 116 V 16 A 16 16 0 0 1 16 0 Z'); filter:drop-shadow(0 0 22px rgba(46,215,16,0.12));">
            <img src="/assets/passageira.png" alt="Passageira Rotta Urbana" style="width:100%; height:100%; object-fit:cover; object-position:46% 26%; transform:scale(1.01); display:block;" />
          </div>
          <div style="position:relative; z-index:3; width:calc(100% - 238px);">
            <div style="display:flex; align-items:center; gap:18px;">
              <span style="width:64px; height:64px; flex:0 0 64px; display:flex; align-items:center; justify-content:center; border-radius:17px; background:#EAF9E6;">
                <img src="https://api.iconify.design/lucide/user-round.svg?color=%232BC80B&width=28" alt="" style="width:28px; height:28px; display:block;" />
              </span>
              <div style="font-family:'Sora',sans-serif; font-size:27px; line-height:1.16; font-weight:700; letter-spacing:-0.7px; color:#151719; white-space:nowrap;">Sou <span style="color:#2DD00A;">Passageiro</span></div>
            </div>
            <p style="width:min(220px,calc(100% - 90px)); margin:0px 0 0 82px; font-family:'Inter',sans-serif; font-size:15px; line-height:1.55; color:#5F6870;">Viagens rápidas, seguras e com o melhor preço da cidade.</p>
          </div>
          <div style="position:absolute; left:38px; bottom:104px; display:flex; align-items:center; gap:5px; white-space:nowrap; z-index:3;">
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/tag.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Menor preço</span>
            </span>
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/shield-check.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Mais segurança</span>
            </span>
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/clock.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Chegue mais rápido</span>
            </span>
          </div>
          <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" style="position:absolute; left:38px; bottom:30px; width:min(320px,calc(100% - 304px)); height:56px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border-radius:12px; text-decoration:none; z-index:3; border:1px solid #28C708; background:linear-gradient(90deg,#24C907,#39D90D);" style-hover="background:linear-gradient(90deg,#2BD80A,#48E016);">
            <span style="font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:#FFFFFF;">Sou Passageiro</span>
            <img src="https://api.iconify.design/lucide/arrow-right.svg?color=%23FFFFFF&width=20" alt="" style="position:absolute; right:18px; width:20px; height:20px; display:block;" />
          </a>
        </div>

        <div style="position:relative; box-sizing:border-box; height:316px; padding:32px 28px 30px 38px; background:rgba(255,255,255,0.96); border:1px solid #E7EBE6; border-radius:24px; box-shadow:0 18px 40px rgba(22,32,25,0.075), 0 2px 8px rgba(22,32,25,0.025); overflow:hidden;">
          <div style="position:absolute; top:30px; right:28px; width:214px; height:228px; z-index:2; clip-path:path('M 16 0 H 198 A 16 16 0 0 1 214 16 V 212 A 16 16 0 0 1 198 228 H 124 A 16 16 0 0 1 108 212 V 148 A 16 16 0 0 0 92 132 H 16 A 16 16 0 0 1 0 116 V 16 A 16 16 0 0 1 16 0 Z'); filter:drop-shadow(0 0 22px rgba(46,215,16,0.12));">
            <img src="/assets/motorista.png" alt="Motorista parceiro Rotta Urbana" style="width:100%; height:100%; object-fit:cover; object-position:50% 22%; transform:scale(1.02); display:block;" />
          </div>
          <div style="position:relative; z-index:3; width:calc(100% - 238px);">
            <div style="display:flex; align-items:center; gap:18px;">
              <span style="width:64px; height:64px; flex:0 0 64px; display:flex; align-items:center; justify-content:center; border-radius:17px; background:#EAF9E6;">
                <img src="https://api.iconify.design/mdi/steering.svg?color=%232BC80B&width=28" alt="" style="width:28px; height:28px; display:block;" />
              </span>
              <div style="font-family:'Sora',sans-serif; font-size:27px; line-height:1.16; font-weight:700; letter-spacing:-0.7px; color:#151719; white-space:nowrap;">Sou <span style="color:#2DD00A;">Motorista</span></div>
            </div>
            <p style="width:min(220px,calc(100% - 90px)); margin:0px 0 0 82px; font-family:'Inter',sans-serif; font-size:15px; line-height:1.55; color:#5F6870;">Aumente seus ganhos e tenha mais flexibilidade no seu dia a dia.</p>
          </div>
          <div style="position:absolute; left:38px; bottom:104px; display:flex; align-items:center; gap:5px; white-space:nowrap; z-index:3;">
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/circle-dollar-sign.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Mais ganhos</span>
            </span>
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/calendar-check.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Seus horários</span>
            </span>
            <span style="height:36px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#EAF8E6;">
              <img src="https://api.iconify.design/lucide/chart-column.svg?color=%2324B90A&width=15" alt="" style="width:15px; height:15px; display:block;" />
              <span style="font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; line-height:1; color:#166F09;">Bônus e incentivos</span>
            </span>
          </div>
          <a href="#planos" style="position:absolute; left:38px; bottom:30px; width:min(320px,calc(100% - 304px)); height:56px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border-radius:12px; text-decoration:none; z-index:3; border:1px solid #222725; background:rgba(255,255,255,0.92);" style-hover="background:#F5F6F4;">
            <span style="font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:#151718;">Sou Motorista</span>
            <img src="https://api.iconify.design/lucide/arrow-right.svg?color=%23151718&width=20" alt="" style="position:absolute; right:18px; width:20px; height:20px; display:block;" />
          </a>
        </div>
      </div>
      </div>
      </sc-if>

      <sc-if value="{{ narrow }}" hint-placeholder-val="{{ false }}">
        <div style="display:flex; flex-direction:column; gap:18px; margin-top:34px;">
          <div style="background:#FFFFFF; border:1px solid #EDEFEA; border-radius:22px; overflow:hidden; box-shadow:0 12px 34px rgba(11,12,13,0.05);">
            <img src="/assets/passageira.png" alt="Passageira Rotta Urbana" style="width:100%; height:186px; object-fit:cover; object-position:50% 32%; display:block;" />
            <div style="padding:22px; display:flex; flex-direction:column; gap:14px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="width:48px; height:48px; flex:0 0 auto; border-radius:15px; background:#E9F9DE; display:flex; align-items:center; justify-content:center;">
                  <img src="https://api.iconify.design/lucide/user-round.svg?color=%2348D10A&width=26" alt="" style="width:26px; height:26px; display:block;" />
                </span>
                <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:22px; color:#0B0C0D; letter-spacing:-0.01em;">Sou <span style="color:#48D10A;">Passageiro</span></div>
              </div>
              <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.6; color:#646A64; margin:0;">Viagens rápidas, seguras e com o melhor preço da cidade.</p>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/tag.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Menor preço</span></span>
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/shield-check.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Mais segurança</span></span>
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/clock.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Chegue mais rápido</span></span>
              </div>
              <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" style="position:relative; display:flex; align-items:center; justify-content:center; padding:17px 44px; border-radius:12px; background:#22B60A; text-decoration:none; width:100%; box-sizing:border-box;" style-hover="background:#48D10A;">
                <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#FFFFFF;">Sou Passageiro</span>
                <img src="https://api.iconify.design/lucide/arrow-right.svg?color=%23FFFFFF&width=20" alt="" style="width:20px; height:20px; display:block; position:absolute; right:20px;" />
              </a>
            </div>
          </div>

          <div style="background:#FFFFFF; border:1px solid #EDEFEA; border-radius:22px; overflow:hidden; box-shadow:0 12px 34px rgba(11,12,13,0.05);">
            <img src="/assets/motorista.png" alt="Motorista parceiro Rotta Urbana" style="width:100%; height:186px; object-fit:cover; object-position:50% 30%; display:block;" />
            <div style="padding:22px; display:flex; flex-direction:column; gap:14px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="width:48px; height:48px; flex:0 0 auto; border-radius:15px; background:#E9F9DE; display:flex; align-items:center; justify-content:center;">
                  <img src="https://api.iconify.design/mdi/steering.svg?color=%2348D10A&width=28" alt="" style="width:28px; height:28px; display:block;" />
                </span>
                <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:22px; color:#0B0C0D; letter-spacing:-0.01em;">Sou <span style="color:#48D10A;">Motorista</span></div>
              </div>
              <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.6; color:#646A64; margin:0;">Aumente seus ganhos e tenha mais flexibilidade no seu dia a dia.</p>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/circle-dollar-sign.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Mais ganhos</span></span>
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/calendar-check.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Seus horários</span></span>
                <span style="display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:100px; background:#EEFAE6;"><img src="https://api.iconify.design/lucide/chart-column.svg?color=%23279A0A&width=15" alt="" style="width:15px; height:15px; display:block;" /><span style="font-family:'Inter',sans-serif; font-weight:600; font-size:12px; color:#1A1C1F;">Bônus e incentivos</span></span>
              </div>
              <a href="#planos" style="position:relative; display:flex; align-items:center; justify-content:center; padding:17px 44px; border-radius:12px; background:#FFFFFF; border:1.5px solid #0B0C0D; text-decoration:none; width:100%; box-sizing:border-box;" style-hover="background:#F5F6F4;">
                <span style="font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">Sou Motorista</span>
                <img src="https://api.iconify.design/lucide/arrow-right.svg?color=%230B0C0D&width=20" alt="" style="width:20px; height:20px; display:block; position:absolute; right:20px;" />
              </a>
            </div>
          </div>
        </div>
      </sc-if>
    </div>
  </section>

  <!-- CONTATO -->
  <section id="contato" style="background:#FFFFFF; padding:clamp(56px,8vw,110px) clamp(16px,4vw,56px); border-bottom:1px solid #E3E6E1; scroll-margin-top:74px;">
    <div style="max-width:1300px; margin:0 auto; display:flex; flex-wrap:wrap; gap:clamp(28px,4vw,56px); align-items:stretch;">
      <div style="flex:1 1 320px; min-width:min(100%,280px); display:flex; flex-direction:column; gap:18px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:12px; letter-spacing:0.1em; color:#279A0A; text-transform:uppercase;">Fale com a gente</div>
        <h2 style="font-family:'Sora',sans-serif; font-weight:800; font-size:clamp(26px,3.2vw,40px); line-height:1.15; color:#0B0C0D; margin:0; letter-spacing:-0.02em; text-wrap:balance;">Suporte humano, resposta rápida</h2>
        <p style="font-family:'Inter',sans-serif; font-size:16px; line-height:1.7; color:#646A64; margin:0; max-width:440px; text-wrap:pretty;">Motorista, passageiro ou empresa: escolha o assunto e a nossa equipe responde em até 24 horas úteis.</p>
        <div style="display:flex; flex-direction:column; gap:12px; margin-top:6px;">
          <a href="https://wa.me/5566996471003" target="_blank" rel="noopener" style="display:flex; align-items:flex-start; gap:12px; text-decoration:none;" style-hover="opacity:0.8;">
            <span style="width:42px; height:42px; border-radius:11px; background:#F7F8F6; display:flex; align-items:center; justify-content:center; flex:0 0 42px;"><img src="https://api.iconify.design/simple-icons/whatsapp.svg?color=%23279A0A&width=20" alt="" style="width:20px; height:20px; display:block;" /></span>
            <span style="display:block;"><span style="display:block; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">WhatsApp</span><span style="display:block; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#646A64;">(66) 99647-1003</span></span>
          </a>
          <a href="mailto:Cleipytt49@gmail.com" target="_blank" rel="noopener" style="display:flex; align-items:flex-start; gap:12px; text-decoration:none;" style-hover="opacity:0.8;">
            <span style="width:42px; height:42px; border-radius:11px; background:#F7F8F6; display:flex; align-items:center; justify-content:center; flex:0 0 42px;"><img src="https://api.iconify.design/lucide/mail.svg?color=%23279A0A&width=20" alt="" style="width:20px; height:20px; display:block;" /></span>
            <span style="display:block;"><span style="display:block; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">E-mail</span><span style="display:block; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#646A64;">Cleipytt49@gmail.com</span></span>
          </a>
          <a href="https://www.instagram.com/rottaurbana/" target="_blank" rel="noopener" style="display:flex; align-items:flex-start; gap:12px; text-decoration:none;" style-hover="opacity:0.8;">
            <span style="width:42px; height:42px; border-radius:11px; background:#F7F8F6; display:flex; align-items:center; justify-content:center; flex:0 0 42px;"><img src="https://api.iconify.design/simple-icons/instagram.svg?color=%23279A0A&width=20" alt="" style="width:20px; height:20px; display:block;" /></span>
            <span style="display:block;"><span style="display:block; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">Instagram</span><span style="display:block; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#646A64;">@rottaurbana</span></span>
          </a>
          <a href="https://m.facebook.com/profile.php?id=61591462089016" target="_blank" rel="noopener" style="display:flex; align-items:flex-start; gap:12px; text-decoration:none;" style-hover="opacity:0.8;">
            <span style="width:42px; height:42px; border-radius:11px; background:#F7F8F6; display:flex; align-items:center; justify-content:center; flex:0 0 42px;"><img src="https://api.iconify.design/simple-icons/facebook.svg?color=%23279A0A&width=20" alt="" style="width:20px; height:20px; display:block;" /></span>
            <span style="display:block;"><span style="display:block; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">Facebook</span><span style="display:block; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#646A64;">Rotta Urbana</span></span>
          </a>
          <a href="https://www.google.com/maps/search/?api=1&query=Rua+Projetada+1+Quadra+4+n%C2%BA+16+Residencial+Gente+Feliz+Sinop+MT" target="_blank" rel="noopener" style="display:flex; align-items:flex-start; gap:12px; text-decoration:none;" style-hover="opacity:0.8;">
            <span style="width:42px; height:42px; border-radius:11px; background:#F7F8F6; display:flex; align-items:center; justify-content:center; flex:0 0 42px;"><img src="https://api.iconify.design/lucide/map-pin.svg?color=%23279A0A&width=20" alt="" style="width:20px; height:20px; display:block;" /></span>
            <span style="display:block;"><span style="display:block; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D;">Endereço</span><span style="display:block; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#646A64;">Rua Projetada 1, Quadra 4, nº 16 — Residencial Gente Feliz, Sinop/MT</span></span>
          </a>
        </div>
      </div>

      <div style="flex:1 1 440px; min-width:min(100%,280px); background:#F7F8F6; border:1.5px solid #E3E6E1; border-radius:20px; padding:clamp(26px,3vw,40px); display:flex; flex-direction:column;">
        <sc-if value="{{ sent }}" hint-placeholder-val="{{ false }}">
          <div style="display:flex; flex-direction:column; gap:14px; align-items:center; text-align:center; padding:clamp(20px,4vw,48px) 0;">
            <img src="https://api.iconify.design/lucide/circle-check-big.svg?color=%2348D10A&width=52" alt="" style="width:52px; height:52px; display:block;" />
            <div style="font-family:'Sora',sans-serif; font-weight:800; font-size:22px; color:#0B0C0D;">Mensagem enviada!</div>
            <p style="font-family:'Inter',sans-serif; font-size:15px; line-height:1.6; color:#646A64; margin:0; max-width:340px;">Recebemos o seu contato. Nossa equipe responde em até 24 horas úteis.</p>
            <button type="button" onClick="{{ reset }}" style="font-family:'Sora',sans-serif; font-weight:700; font-size:14px; color:#279A0A; background:none; border:none; cursor:pointer; padding:8px;">Enviar outra mensagem</button>
          </div>
        </sc-if>
        <sc-if value="{{ notSent }}" hint-placeholder-val="{{ true }}">
          <form onSubmit="{{ submit }}" style="display:flex; flex-direction:column; gap:14px; flex:1;">
            <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:19px; color:#0B0C0D; margin-bottom:4px;">Formulário de contato</div>
            <sc-if value="{{ hasError }}" hint-placeholder-val="{{ false }}">
              <div role="alert" style="font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#A61B1B; background:#FFF1F1; border:1px solid #F3B5B5; border-radius:10px; padding:12px 14px;">{{ errorMessage }}</div>
            </sc-if>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px;">
              <input type="text" required="required" placeholder="Nome completo" style="font-family:'Inter',sans-serif; font-size:15px; color:#0B0C0D; padding:15px 16px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; outline:none; width:100%; box-sizing:border-box;" style-focus="border-color:#48D10A;" />
              <input type="tel" placeholder="WhatsApp" style="font-family:'Inter',sans-serif; font-size:15px; color:#0B0C0D; padding:15px 16px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; outline:none; width:100%; box-sizing:border-box;" style-focus="border-color:#48D10A;" />
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px;">
              <input type="email" required="required" placeholder="Seu e-mail" style="font-family:'Inter',sans-serif; font-size:15px; color:#0B0C0D; padding:15px 16px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; outline:none; width:100%; box-sizing:border-box;" style-focus="border-color:#48D10A;" />
              <select required="required" style="font-family:'Inter',sans-serif; font-size:15px; color:#0B0C0D; padding:15px 16px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; outline:none; width:100%; box-sizing:border-box; appearance:none; cursor:pointer;" style-focus="border-color:#48D10A;">
                <option value="">Assunto</option>
                <option value="motorista">Quero ser motorista parceiro</option>
                <option value="planos">Dúvidas sobre planos e taxas</option>
                <option value="passageiro">Suporte ao passageiro</option>
                <option value="pagamentos">Pagamentos e saques via PIX</option>
                <option value="seguranca">Segurança e ocorrências</option>
                <option value="empresas">Parcerias e empresas</option>
                <option value="outro">Outro assunto</option>
              </select>
            </div>
            <textarea rows="5" placeholder="Sua mensagem" style="font-family:'Inter',sans-serif; font-size:15px; color:#0B0C0D; padding:15px 16px; border-radius:10px; border:1.5px solid #E3E6E1; background:#FFFFFF; outline:none; width:100%; box-sizing:border-box; resize:vertical; flex:1; min-height:132px;" style-focus="border-color:#48D10A;"></textarea>
            <label style="display:flex; gap:9px; align-items:flex-start; cursor:pointer;">
              <input type="checkbox" required="required" style="width:16px; height:16px; margin-top:2px; accent-color:#48D10A; cursor:pointer;" />
              <span style="font-family:'Inter',sans-serif; font-size:13px; line-height:1.5; color:#646A64;">Autorizo o contato da equipe Rotta Urbana e aceito a política de privacidade.</span>
            </label>
            <button type="submit" style="display:flex; align-items:center; justify-content:center; gap:9px; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#0B0C0D; padding:17px 24px; border-radius:10px; background:#48D10A; border:none; cursor:pointer; width:100%;" style-hover="background:#63F21B;">
              <img src="https://api.iconify.design/lucide/send.svg?color=%230B0C0D&width=18" alt="" style="width:18px; height:18px; display:block;" />Enviar mensagem
            </button>
          </form>
        </sc-if>
      </div>
    </div>
  </section>

  <!-- RODAPE -->
  <footer style="background:#0B0C0D; padding:clamp(44px,6vw,72px) clamp(16px,4vw,56px) 28px clamp(16px,4vw,56px);">
    <div style="max-width:1300px; margin:0 auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:clamp(28px,4vw,44px); padding-bottom:40px; border-bottom:1px solid #1A1C1F;">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <img src="/assets/logo.png" alt="Rotta Urbana" style="height:clamp(64px,7vw,88px); width:auto; max-width:100%; object-fit:contain; align-self:flex-start;" />
        <p style="font-family:'Inter',sans-serif; font-size:14px; line-height:1.65; color:#8A9088; margin:0; max-width:280px;">Mobilidade urbana justa: mais economia para o passageiro, mais lucro para o motorista.</p>
        <div style="display:flex; gap:10px; margin-top:4px;">
          <a href="https://www.instagram.com/rottaurbana/" target="_blank" rel="noopener" aria-label="Instagram" style="width:44px; height:44px; border-radius:50%; border:1px solid #232527; display:flex; align-items:center; justify-content:center; text-decoration:none;" style-hover="border-color:#48D10A;"><img src="https://api.iconify.design/simple-icons/instagram.svg?color=%2363F21B&width=19" alt="" style="width:19px; height:19px; display:block;" /></a>
          <a href="https://m.facebook.com/profile.php?id=61591462089016" target="_blank" rel="noopener" aria-label="Facebook" style="width:44px; height:44px; border-radius:50%; border:1px solid #232527; display:flex; align-items:center; justify-content:center; text-decoration:none;" style-hover="border-color:#48D10A;"><img src="https://api.iconify.design/simple-icons/facebook.svg?color=%2363F21B&width=19" alt="" style="width:19px; height:19px; display:block;" /></a>
          <a href="https://wa.me/5566996471003" target="_blank" rel="noopener" aria-label="WhatsApp" style="width:44px; height:44px; border-radius:50%; border:1px solid #232527; display:flex; align-items:center; justify-content:center; text-decoration:none;" style-hover="border-color:#48D10A;"><img src="https://api.iconify.design/simple-icons/whatsapp.svg?color=%2363F21B&width=19" alt="" style="width:19px; height:19px; display:block;" /></a>
          <a href="mailto:Cleipytt49@gmail.com" aria-label="E-mail" style="width:44px; height:44px; border-radius:50%; border:1px solid #232527; display:flex; align-items:center; justify-content:center; text-decoration:none;" style-hover="border-color:#48D10A;"><img src="https://api.iconify.design/lucide/mail.svg?color=%2363F21B&width=19" alt="" style="width:19px; height:19px; display:block;" /></a>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#FFFFFF; text-transform:uppercase; letter-spacing:0.06em;">Passageiro</div>
        <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" target="_blank" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/download.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Baixar o app</a>
        <a href="#passageiro" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/map-pin.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Como funciona</a>
        <a href="#passageiro" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/shield-check.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Segurança</a>
      </div>
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#FFFFFF; text-transform:uppercase; letter-spacing:0.06em;">Motorista</div>
        <a href="#motorista" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/car.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Seja parceiro</a>
        <a href="#planos" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/tag.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Planos e valores</a>
        <a href="#contato" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/headphones.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Central de ajuda</a>
      </div>
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#FFFFFF; text-transform:uppercase; letter-spacing:0.06em;">Contato</div>
        <a href="mailto:Cleipytt49@gmail.com" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/lucide/mail.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />Cleipytt49@gmail.com</a>
        <a href="https://wa.me/5566996471003" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/simple-icons/whatsapp.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />(66) 99647-1003</a>
        <a href="https://www.instagram.com/rottaurbana/" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:9px; font-family:'Inter',sans-serif; font-size:14px; color:#8A9088; text-decoration:none;" style-hover="color:#63F21B;"><img src="https://api.iconify.design/simple-icons/instagram.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block;" />@rottaurbana</a>
        <span style="display:flex; align-items:flex-start; gap:9px; font-family:'Inter',sans-serif; font-size:14px; line-height:1.5; color:#8A9088;"><img src="https://api.iconify.design/lucide/map-pin.svg?color=%23646A64&width=16" alt="" style="width:16px; height:16px; display:block; flex:0 0 16px; margin-top:3px;" />Rua Projetada 1, Quadra 4, nº 16 — Residencial Gente Feliz, Sinop/MT</span>
      </div>
    </div>
    <div style="max-width:1300px; margin:0 auto; display:flex; justify-content:space-between; align-items:center; padding-top:24px; flex-wrap:wrap; gap:12px;">
      <span style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64;">© 2026 Rotta Urbana Ltda. Todos os direitos reservados.</span>
      <div style="display:flex; gap:20px; flex-wrap:wrap;">
        <a href="/politica-de-privacidade" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64; text-decoration:none;" style-hover="color:#8A9088;">Política de Privacidade</a>
        <a href="/termos-de-uso" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64; text-decoration:none;" style-hover="color:#8A9088;">Termos de Uso</a>
        <a href="/exclusao-de-conta" style="font-family:'Inter',sans-serif; font-size:13px; color:#646A64; text-decoration:none;" style-hover="color:#8A9088;">Exclusão de Conta</a>
      </div>
    </div>
  </footer>

</div>

</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;: {&quot;width&quot;: 1600}, &quot;highlightedPlan&quot;: {&quot;editor&quot;: &quot;enum&quot;, &quot;default&quot;: &quot;smart&quot;, &quot;options&quot;: [&quot;eco&quot;, &quot;smart&quot;, &quot;pro&quot;, &quot;vip&quot;], &quot;tsType&quot;: &quot;string&quot;, &quot;section&quot;: &quot;Planos&quot;}}">
class Component extends DCLogic {
  state = { sent: false, errorMessage: '', menu: false, vw: typeof window !== 'undefined' ? window.innerWidth : 1440 };

  componentDidMount() {
    this._onResize = () => { if (window.innerWidth !== this.state.vw) this.setState({ vw: window.innerWidth }); };
    window.addEventListener('resize', this._onResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
  }

  renderVals() {
    const highlight = this.props.highlightedPlan ?? 'smart';
    const s = (typeof window !== 'undefined' && window.__ADMIN_SETTINGS__) || {};

    const ecoPrice = (s.commission_pct !== undefined ? s.commission_pct : 15) + '%';
    const smartPrice = 'R$ ' + Number(s.subscription_daily_amount || 3.00).toFixed(2).replace('.', ',');
    const proPrice = 'R$ ' + Number(s.plan_weekly_price || 12.50).toFixed(2).replace('.', ',');
    const vipPrice = 'R$ ' + Number(s.subscription_monthly_amount || 49.90).toFixed(2).replace('.', ',');

    const base = [
      { key: 'eco', name: 'ECO Flex', price: ecoPrice, unit: 'por corrida', audience: 'Quem roda poucas horas ou quer testar', benefit: 'Sem mensalidade. Pague apenas quando rodar.' },
      { key: 'smart', name: 'Rotta Smart', price: smartPrice, unit: 'fixo por corrida', audience: 'Motoristas do dia a dia', benefit: 'Taxa fixa independente do valor final da corrida. Quanto mais longa a viagem, mais você lucra.' },
      { key: 'pro', name: 'Rotta Pro', price: proPrice, unit: 'por semana', audience: 'Motoristas em tempo integral', benefit: 'Corridas ilimitadas com um custo semanal irrisório. Lucro máximo no seu bolso.' },
      { key: 'vip', name: 'Rotta VIP', price: vipPrice, unit: 'por mês', audience: 'Os profissionais das ruas', benefit: 'Passe livre mensal! Roda o mês inteiro pagando um único valor fixo.' },
    ];
    const arrow = c => 'https://api.iconify.design/lucide/arrow-right.svg?color=' + encodeURIComponent(c) + '&width=16';
    const plans = base.map(p => {
      const on = p.key === highlight;
      return {
        name: p.name, price: p.price, unit: p.unit, audience: p.audience, benefit: p.benefit,
        badge: on,
        plain: !on,
        bg: on ? '#1A1C1F' : '#131416',
        border: on ? '#48D10A' : '#232527',
        ctaBg: on ? '#48D10A' : 'transparent',
        ctaColor: on ? '#0B0C0D' : '#FFFFFF',
        ctaBorder: on ? '#48D10A' : '#323538',
        arrow: arrow(on ? '#0B0C0D' : '#FFFFFF'),
      };
    });
    const vw = this.state.vw;
    const narrow = vw < 900;
    const scale = Math.min(1, Math.max(0.68, (Math.min(vw, 1400) - 48) / 1250));
    return {
      plans,
      wide: !narrow,
      narrow,
      cardsScale: 'scale(' + scale.toFixed(3) + ')',
      cardsBoxH: Math.round(316 * scale) + 'px',
      menuOpen: this.state.menu,
      menuClosed: !this.state.menu,
      toggleMenu: () => this.setState(s => ({ menu: !s.menu })),
      closeMenu: () => this.setState({ menu: false }),
      sent: this.state.sent,
      notSent: !this.state.sent,
      hasError: Boolean(this.state.errorMessage),
      errorMessage: this.state.errorMessage,
      submit: async e => {
        e.preventDefault();
        const form = e.currentTarget || e.target;
        const submitButton = form?.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
          const inputs = form.querySelectorAll('input, select, textarea');
          const data = {};
          inputs.forEach(i => {
            if (i.placeholder === 'Nome completo') data.name = i.value;
            else if (i.placeholder === 'WhatsApp') data.phone = i.value;
            else if (i.placeholder === 'Seu e-mail') data.email = i.value;
            else if (i.tagName === 'SELECT') data.subject = i.value;
            else if (i.tagName === 'TEXTAREA') data.message = i.value;
          });

          const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Não foi possível enviar sua mensagem.');
          }

          // O Lead só é contabilizado depois que o servidor confirma o cadastro.
          if (typeof window.fbq === 'function') {
            window.fbq('track', 'Lead', {
              content_name: 'Formulário de contato',
              content_category: 'Contato'
            });
          }
          this.setState({ sent: true, errorMessage: '' });
        } catch (err) {
          console.error('Error posting lead:', err);
          this.setState({ sent: false, errorMessage: err.message || 'Não foi possível enviar sua mensagem. Tente novamente.' });
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      },
      reset: () => this.setState({ sent: false, errorMessage: '' }),
    };
  }
}
</script>
</body>
</html>`;
}
