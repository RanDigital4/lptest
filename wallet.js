/* RND Wallet Selector — MetaMask, Trust Wallet and injected EVM wallets.
   No private keys or seed phrases are ever requested or handled by this file. */
(() => {
  'use strict';
  if (window.RNDWallet) return;

  const state = { provider: null, providers: [], announced: [], modal: null, resolve: null, reject: null };
  const $ = (tag, attrs = {}, text = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  };

  function discover() {
    const found = [];
    const add = (p, name = '') => {
      if (!p || typeof p.request !== 'function' || found.some(x => x.provider === p)) return;
      found.push({ provider: p, name });
    };
    const eth = window.ethereum;
    if (eth?.providers?.length) eth.providers.forEach(p => add(p, p.isMetaMask ? 'MetaMask' : p.isTrust ? 'Trust Wallet' : 'Browser Wallet'));
    else if (eth) add(eth, eth.isTrust ? 'Trust Wallet' : eth.isMetaMask ? 'MetaMask' : 'Browser Wallet');
    state.announced.forEach(x => add(x.provider, x.info?.name || 'Browser Wallet'));
    state.providers = found;
    return found;
  }

  // EIP-6963 wallet discovery (supported by many modern browser wallets).
  try {
    window.addEventListener('eip6963:announceProvider', event => {
      const detail = event.detail || {};
      if (detail.provider) {
        state.announced.push(detail);
        discover();
      }
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch (_) {}

  function styleModal() {
    if (document.getElementById('rnd-wallet-style')) return;
    const css = `
      #rnd-wallet-overlay{position:fixed;inset:0;z-index:1000000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,7,18,.78);backdrop-filter:blur(8px)}
      #rnd-wallet-dialog{width:min(430px,100%);padding:24px;border:1px solid rgba(91,173,235,.35);border-radius:20px;background:linear-gradient(145deg,#102344,#071326);color:#edf5ff;box-shadow:0 24px 80px #0009;font-family:system-ui,sans-serif}
      #rnd-wallet-dialog h3{margin:0 0 6px;font-size:21px}#rnd-wallet-dialog p{margin:0 0 18px;color:#a9bdd9;font-size:13px;line-height:1.5}
      .rnd-wallet-option{display:flex;width:100%;align-items:center;gap:13px;margin:9px 0;padding:13px;border:1px solid rgba(133,173,224,.22);border-radius:13px;background:#0a1930;color:#f5f8ff;text-align:left;cursor:pointer;font-size:14px;font-weight:700}
      .rnd-wallet-option:hover{border-color:#42c9ee;background:#102849}.rnd-wallet-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#142c4d;font-size:20px}
      .rnd-wallet-option small{display:block;color:#9db1cf;font-size:11px;font-weight:400;margin-top:3px}
      #rnd-wallet-close{float:right;border:0;background:transparent;color:#c6d7ef;font-size:24px;cursor:pointer}
      #rnd-wallet-help{margin-top:14px;font-size:11px;color:#8fa6c7;line-height:1.5}
    `;
    document.head.appendChild($('style', { id: 'rnd-wallet-style' }, css));
  }

  function ensureModal() {
    if (state.modal) return state.modal;
    styleModal();
    const overlay = $('div', { id: 'rnd-wallet-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rnd-wallet-title' });
    const dialog = $('div', { id: 'rnd-wallet-dialog' });
    const close = $('button', { id: 'rnd-wallet-close', type: 'button', 'aria-label': 'Close wallet selector' }, '×');
    close.addEventListener('click', () => finish(new Error('Wallet selection cancelled.')));
    const title = $('h3', { id: 'rnd-wallet-title' }, 'Connect a wallet');
    const desc = $('p', {}, 'Choose your wallet. Your wallet will ask you to approve the connection.');
    const options = $('div', { id: 'rnd-wallet-options' });
    const help = $('div', { id: 'rnd-wallet-help' }, 'Mobile tip: If this page opened in Chrome from WhatsApp, choose your wallet app. The site will reopen inside that wallet. Then tap Connect Wallet again if needed.');
    dialog.append(close, title, desc, options, help);
    overlay.append(dialog);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(new Error('Wallet selection cancelled.')); });
    document.body.append(overlay);
    state.modal = overlay;
    return overlay;
  }

  function finish(error, provider) {
    if (state.modal) state.modal.style.display = 'none';
    const resolve = state.resolve, reject = state.reject;
    state.resolve = state.reject = null;
    if (error) reject?.(error);
    else resolve?.(provider);
  }

  function dappUrl() {
    return location.host + location.pathname + location.search + location.hash;
  }

  function openWalletApp(wallet) {
    const current = location.href;
    if (wallet === 'metamask') {
      location.href = `https://metamask.app.link/dapp/${dappUrl()}`;
      return;
    }
    if (wallet === 'trust') {
      location.href = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(current)}`;
      return;
    }
  }

  async function useProvider(provider) {
    if (!provider) throw new Error('Selected wallet provider was not found. Open the website inside that wallet app and try again.');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('Wallet did not return an account. Please approve the connection.');
    state.provider = provider;
    finish(null, provider);
    window.dispatchEvent(new CustomEvent('rndwallet:connected', { detail: { provider, account: accounts[0] } }));
    return provider;
  }

  function openSelector() {
    const overlay = ensureModal();
    const options = overlay.querySelector('#rnd-wallet-options');
    options.innerHTML = '';
    const detected = discover();

    const makeOption = (icon, title, subtitle, action) => {
      const btn = $('button', { class: 'rnd-wallet-option', type: 'button' });
      const badge = $('span', { class: 'rnd-wallet-icon' }, icon);
      const label = $('span');
      label.append($('span', {}, title), $('small', {}, subtitle));
      btn.append(badge, label);
      btn.addEventListener('click', action);
      options.append(btn);
    };

    const meta = detected.find(x => /meta.?mask/i.test(x.name) || x.provider.isMetaMask);
    const trust = detected.find(x => /trust/i.test(x.name) || x.provider.isTrust);
    const other = detected.find(x => x !== meta && x !== trust);

    makeOption('🦊', 'MetaMask', meta ? 'Detected on this device' : 'Open the MetaMask app', async () => {
      if (meta) { try { await useProvider(meta.provider); } catch (e) { finish(e); } }
      else { finish(new Error('MetaMask app kholne ke baad website ko MetaMask browser me kholkar Connect Wallet dabayein.')); openWalletApp('metamask'); }
    });
    makeOption('🛡️', 'Trust Wallet', trust ? 'Detected on this device' : 'Open the Trust Wallet app', async () => {
      if (trust) { try { await useProvider(trust.provider); } catch (e) { finish(e); } }
      else { finish(new Error('Trust Wallet app kholne ke baad website ko Trust Wallet browser me kholkar Connect Wallet dabayein.')); openWalletApp('trust'); }
    });
    if (other) {
      makeOption('🌐', other.name || 'Browser Wallet', 'Use the wallet detected by this browser', async () => {
        try { await useProvider(other.provider); } catch (e) { finish(e); }
      });
    }
    if (!detected.length) {
      makeOption('🌐', 'Other wallet browser', 'Open this website inside your installed wallet app', () => {
        finish(new Error('Apne wallet app ke DApp browser me website kholkar Connect Wallet dabayein.'));
      });
    }
    overlay.style.display = 'flex';
  }

  async function connect() {
    if (state.provider) {
      try {
        const accounts = await state.provider.request({ method: 'eth_accounts' });
        if (accounts?.length) return state.provider;
      } catch (_) {}
      state.provider = null;
    }
    discover();
    return new Promise((resolve, reject) => {
      state.resolve = resolve;
      state.reject = reject;
      openSelector();
    });
  }

  window.RNDWallet = {
    connect,
    getProvider: () => state.provider,
    reset: () => { state.provider = null; },
    open: openSelector
  };
})();
