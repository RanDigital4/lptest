(() => {
  'use strict';
  const C = window.RND_CONFIG;
  const $ = id => document.getElementById(id);
  const fmt = (v, digits=4) => Number(v).toLocaleString('en-US',{maximumFractionDigits:digits});
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  const zero = ethers.ZeroAddress;
  let browserProvider=null, signer=null, account=null, locker=null, readProvider=null, readLocker=null, toastTimer, quoteSeq=0, referralFromUrl=zero;
  const tokenContracts = {};
  const toast = msg => { const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),4300); };
  const status = (id,msg,link) => { const el=$(id); if(!el)return; el.textContent=msg; if(link){el.append(' ');const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener';a.textContent='View on BscScan ↗';el.append(a);} if(id==='liquidityStatus')updateBusy(msg,link); };
  // ---- Full-screen "please wait" overlay ----
  let busyEl=null;
  function ensureBusy(){
    if(busyEl)return busyEl;
    busyEl=document.createElement('div');
    busyEl.style.cssText='position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(3,8,20,.82);backdrop-filter:blur(6px);padding:20px';
    busyEl.innerHTML='<div style="max-width:460px;width:100%;text-align:center;background:#0e1b33;border:1px solid #c9a24a;border-radius:20px;padding:32px 26px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6)"><div id="busySpin" style="width:54px;height:54px;margin:0 auto 18px;border:5px solid rgba(255,255,255,.15);border-top-color:#f1c75b;border-radius:50%;animation:busyspin 1s linear infinite"></div><div id="busyTitle" style="font-size:1.35rem;font-weight:700;margin-bottom:10px"></div><div id="busyMsg" style="font-size:1rem;line-height:1.5;opacity:.9"></div><div style="margin-top:16px;font-size:.85rem;color:#f1c75b">⚠ Please wait. Page ko band ya refresh na karein.</div></div>';
    const st=document.createElement('style');st.textContent='@keyframes busyspin{to{transform:rotate(360deg)}}';
    document.head.append(st);document.body.append(busyEl);
    return busyEl;
  }
  function showBusy(title,msg){const el=ensureBusy();el.querySelector('#busyTitle').textContent=title;el.querySelector('#busyMsg').textContent=msg||'';el.style.display='flex';}
  function updateBusy(msg,link){
    if(!busyEl||busyEl.style.display==='none')return;
    const m=busyEl.querySelector('#busyMsg');m.textContent=msg||'';
    if(link){m.append(' ');const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener';a.style.color='#5ad1ff';a.textContent='View on BscScan ↗';m.append(a);}
  }
  function hideBusy(){if(busyEl)busyEl.style.display='none';}
  const txUrl = hash => `${C.explorer}/tx/${hash}`;
  const addrUrl = address => `${C.explorer}/address/${address}`;
  const parseErr = e => e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || 'Transaction failed or was rejected.';
  const units = (v,dec=18) => ethers.parseUnits(String(v),dec);
  const human = (v,dec=18,d=4) => fmt(Number(ethers.formatUnits(v,dec)),d);
  // Input ko valid decimal string banata hai (max 18 decimals)
  const cleanAmount = raw => {
    raw=String(raw||'').trim().replace(',', '.');
    if(!/^[0-9]*\.?[0-9]*$/.test(raw)||raw===''||raw==='.')return null;
    let [i,f=''] = raw.split('.');
    f=f.slice(0,18);
    const s=(i||'0')+(f?'.'+f:'');
    return Number(s)>0?s:null;
  };

  function checkConfig(){
    for(const k of ['locker','rnd','usdt','lpPair']){
      if(!ethers.isAddress(C[k]))throw new Error(`config.js me "${k}" address galat/adhura hai (0x ke baad poore 40 akshar chahiye). BscScan se poora address paste karein.`);
    }
  }
  function setConnectedUI(){
    $('connectBtn').textContent=account?short(account):'Connect Wallet';
    $('networkBadge').textContent=account?'● BNB Chain connected':'● Not connected';
    $('networkBadge').classList.toggle('good',!!account);
    $('referralLink').value=account?`${location.origin}${location.pathname}?ref=${account}`:'Connect wallet to generate your link';
    status('liquidityStatus',account?'':'Connect your wallet to begin.');
  }
  async function ensureRead(){
    if(readLocker)return;
    checkConfig();
    let lastErr;
    for(const rpc of C.rpcUrls){
      try{
        const p=new ethers.JsonRpcProvider(rpc,56,{staticNetwork:true});
        const c=new ethers.Contract(C.locker,C.lockerAbi,p);
        await c.totalLPLocked();
        readProvider=p;readLocker=c;
        // Sanity: contract ke andar ke token addresses config se match hone chahiye
        try{
          const [r,u]=await Promise.all([c.RND(),c.USDT()]);
          if(r.toLowerCase()!==C.rnd.toLowerCase()||u.toLowerCase()!==C.usdt.toLowerCase())toast('Warning: config.js ke RND/USDT address contract se match nahi karte.');
        }catch(e){}
        return;
      }catch(e){lastErr=e;}
    }
    readProvider=null;readLocker=null;
    throw new Error('BNB Chain RPC se locker contract read nahi ho paya. Locker address aur network check karein.');
  }
  function connectedLocker(){if(!locker||!account)throw new Error('Connect your wallet first.');return locker;}
  async function ensureBsc(){
    checkConfig();
    if(!window.RNDWallet)throw new Error('Wallet connector load nahi hua. index.html me wallet.js ko app.js se pehle load karein.');
    const injectedProvider=await window.RNDWallet.connect();
    browserProvider=new ethers.BrowserProvider(injectedProvider);
    await browserProvider.send('eth_requestAccounts',[]);
    let net=await browserProvider.getNetwork();
    if(Number(net.chainId)!==56){
      try{await injectedProvider.request({method:'wallet_switchEthereumChain',params:[{chainId:C.chainHex}]});}
      catch(e){if(e.code===4902){await injectedProvider.request({method:'wallet_addEthereumChain',params:[{chainId:C.chainHex,chainName:C.chainName,nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:C.rpcUrls,blockExplorerUrls:[C.explorer]}]});}else throw new Error('Please switch your wallet to BNB Smart Chain (Chain ID 56).');}
      browserProvider=new ethers.BrowserProvider(injectedProvider);net=await browserProvider.getNetwork();
    }
    if(Number(net.chainId)!==56)throw new Error('Wallet is not connected to BNB Smart Chain.');
    signer=await browserProvider.getSigner();account=await signer.getAddress();locker=new ethers.Contract(C.locker,C.lockerAbi,signer);
    tokenContracts.usdt=new ethers.Contract(C.usdt,C.erc20Abi,signer);tokenContracts.rnd=new ethers.Contract(C.rnd,C.erc20Abi,signer);
    setConnectedUI();await loadAll();toast('Wallet connected to BNB Smart Chain.');
    if($('usdtAmount').value)quoteRNDFromUSDT();
  }
  async function connect(){try{await ensureBsc();}catch(e){toast(parseErr(e));}}
  // Locker ke LP tokens ko pool ke hisse se asli USDT + RND me convert karta hai
  async function renderLpBreakdown(lp){
    const big=$('totalLp');
    let box=$('lpBreakdown');
    if(!box){box=document.createElement('div');box.id='lpBreakdown';box.style.cssText='margin-top:6px;font-size:.9rem;line-height:1.6;opacity:.9';big.insertAdjacentElement('afterend',box);}
    try{
      const pair=new ethers.Contract(C.lpPair,['function token0() view returns(address)','function totalSupply() view returns(uint256)','function getReserves() view returns(uint112,uint112,uint32)'],readProvider);
      const [t0,supply,res]=await Promise.all([pair.token0(),pair.totalSupply(),pair.getReserves()]);
      if(supply===0n)throw new Error('empty pool');
      const rndIs0=t0.toLowerCase()===C.rnd.toLowerCase();
      const reserveRnd=BigInt(rndIs0?res[0]:res[1]);const reserveUsdt=BigInt(rndIs0?res[1]:res[0]);
      const usdtWei=lp*reserveUsdt/supply;
      const rndWei=lp*reserveRnd/supply;
      const usdtN=Number(ethers.formatUnits(usdtWei,18));
      const totalUsd=usdtN*2; // pool balanced: RND side ki value = USDT side ki value
      big.textContent=`$${fmt(totalUsd,2)}`;
      box.innerHTML='';
      const l1=document.createElement('div');l1.textContent=`${fmt(usdtN,4)} USDT + ${human(rndWei,18,4)} RND`;
      const l2=document.createElement('div');l2.textContent=`LP tokens: ${human(lp,18,4)}`;
      box.append(l1,l2);
    }catch(e){
      big.textContent=human(lp,18,4);
      box.textContent='LP tokens (USDT/RND breakdown unavailable)';
    }
  }
  async function loadStats(){
    await ensureRead();
    const [lp,out,users,reserve]=await Promise.all([readLocker.totalLPLocked(),readLocker.totalOutstandingRewards(),readLocker.totalRegisteredUsers(),readLocker.rewardReserveBalance()]);
    await renderLpBreakdown(lp);$('outstanding').textContent=`${human(out,18,2)} RND`;$('registered').textContent=fmt(Number(users),0);$('reserve').textContent=`${human(reserve,18,2)} RND`;$('reserveDetail').textContent=`${human(reserve,18,4)} RND`;
  }
  async function loadAccount(){
    if(!account)return;
    await ensureRead();
    const [info,ids,refCount,refUsers,refRecordsCount]=await Promise.all([readLocker.getUserInfo(account),readLocker.getUserPositionIds(account),readLocker.getReferralCount(account),readLocker.getReferredUsers(account),readLocker.getReferralRewardCount(account)]);
    $('positionCount').textContent=fmt(ids.length,0);$('myReferrer').textContent=info.registered?(info.referrer===zero?'Direct / no referrer':short(info.referrer)):'Not registered';$('directCount').textContent=fmt(Number(refCount),0);$('refRecordCount').textContent=fmt(Number(refRecordsCount),0);
    const refList=$('referredList');refList.innerHTML='';
    if(!refUsers.length)refList.textContent='No direct referrals recorded on-chain yet.';
    else refUsers.forEach((a,i)=>{const row=document.createElement('div');row.className='list-row';const n=document.createElement('span');n.textContent=`${i+1}. ${short(a)}`;const link=document.createElement('a');link.href=addrUrl(a);link.target='_blank';link.rel='noopener';link.textContent='BscScan ↗';row.append(n,link);refList.append(row);});
    let pending=0,claimed=0;const ledger=$('referralLedger');ledger.innerHTML='';
    for(let i=0;i<Number(refRecordsCount);i++){
      try{const r=await readLocker.getReferralRewardRecord(account,i);const amount=Number(ethers.formatUnits(r.amount,18));if(r.claimed)claimed+=amount;else pending+=amount;const row=document.createElement('div');row.className='list-row';const left=document.createElement('span');left.textContent=`#${r.positionId} · ${short(r.referredUser)}`;const right=document.createElement('b');right.textContent=`${fmt(amount,3)} RND · ${r.claimed?'Claimed':'Pending'}`;row.append(left,right);ledger.append(row);}catch(e){}
    }
    if(!Number(refRecordsCount))ledger.textContent='No referral reward records found for this wallet.';
    $('refPending').textContent=`${fmt(pending,3)} RND`;$('refClaimed').textContent=`${fmt(claimed,3)} RND`;
    let userPending=0,userClaimed=0;const list=$('positionsList');list.innerHTML='';
    if(!ids.length)list.textContent='No LP positions have been recorded for this wallet yet.';
    for(const id of ids){
      const p=await readLocker.getPosition(id);const unlock=Number(p.unlockAt);const mature=Date.now()/1000>=unlock;const lpWithdrawn=p.lpWithdrawn;const rewardsClaimed=p.rewardsClaimed;
      if(!rewardsClaimed)userPending+=Number(ethers.formatUnits(p.rewardAmount,18));else userClaimed+=Number(ethers.formatUnits(p.rewardAmount,18));
      const card=document.createElement('article');card.className='position-card';
      const head=document.createElement('div');head.className='position-head';const title=document.createElement('b');title.textContent=`LP Position #${id}`;const pill=document.createElement('span');pill.className=`status-pill ${mature?'':'locked'}`;pill.textContent=lpWithdrawn?'LP Withdrawn':mature?'Matured':'Locked';head.append(title,pill);card.append(head);
      const grid=document.createElement('div');grid.className='position-grid';
      const vals=[['USDT added',`${human(p.usdtAdded)} USDT`],['RND added',`${human(p.rndAdded)} RND`],['LP tokens',human(p.lpAmount,18,6)],['Unlock date',new Date(unlock*1000).toLocaleString()],['User reward',`${human(p.rewardAmount)} RND`],['Referral reward',`${human(p.referralRewardAmount)} RND`],['Referrer',p.referrer===zero?'None':short(p.referrer)],['Rewards',rewardsClaimed?'Claimed':'Pending']];
      vals.forEach(([k,v])=>{const d=document.createElement('div');const s=document.createElement('span');s.textContent=k;const b=document.createElement('b');b.textContent=v;d.append(s,b);grid.append(d);});card.append(grid);
      const actions=document.createElement('div');actions.className='position-actions';
      const claim=document.createElement('button');claim.className='btn btn-gold';const noRew=p.rewardAmount===0n&&p.referralRewardAmount===0n;claim.textContent=rewardsClaimed?'Rewards claimed':noRew?'No reward':mature?'Claim rewards':'Rewards locked';claim.disabled=rewardsClaimed||noRew||!mature;claim.onclick=()=>claimPosition(id);
      const withdraw=document.createElement('button');withdraw.className='btn btn-outline';withdraw.textContent=lpWithdrawn?'LP withdrawn':mature?'Withdraw LP':'Withdraw locked LP';withdraw.disabled=lpWithdrawn||!mature;withdraw.onclick=()=>withdrawPosition(id);
      actions.append(claim,withdraw);card.append(actions);list.append(card);
    }
    $('myPending').textContent=`${fmt(userPending,3)} RND`;$('rewardPendingBig').innerHTML=`${fmt(userPending,3)} <small>RND</small>`;$('claimedTotal').textContent=`${fmt(userClaimed,3)} RND`;
  }
  async function loadAll(){try{await loadStats();if(account){await loadAccount();await loadWalletBalances();}}catch(e){toast(parseErr(e));}}
  async function loadWalletBalances(){if(!account)return;try{const [u,r]=await Promise.all([tokenContracts.usdt.balanceOf(account),tokenContracts.rnd.balanceOf(account)]);$('usdtBalance').textContent=`Wallet: ${human(u,18,4)} USDT`;$('rndBalance').textContent=`Wallet: ${human(r,18,4)} RND`;}catch(e){$('usdtBalance').textContent=$('rndBalance').textContent='Wallet balance unavailable';}}

  // USDT dalte hi live on-chain price se RND auto-calculate + reward preview
  async function quoteRNDFromUSDT(){
    const seq=++quoteSeq;
    const clean=cleanAmount($('usdtAmount').value);
    if(!clean){
      $('rndAmount').value='';
      $('quoteNote').textContent='Enter USDT amount. RND will be calculated automatically using the live on-chain RND/USDT price.';
      return;
    }
    try{
      await ensureRead();
      const priceWei=await readLocker.getSpotPriceRNDInUSDT();
      if(priceWei<=0n)throw new Error('Live RND price is unavailable.');
      let usdtWei=units(clean,18);
      let rndWei=usdtWei*10n**18n/priceWei;
      let step=0n,perStep=0n,pr=null,bumped=false;
      try{
        [step,perStep]=await Promise.all([readLocker.MIN_REWARD_STEP_USDT(),readLocker.REWARD_PER_STEP()]);
        pr=await readLocker.previewReward(usdtWei,rndWei);
        // Contract floor() karta hai: rounding se ek step kat sakta hai (jaise 50 -> 49.9999). Tab 0.01 USDT badha dete hain.
        if(pr.userReward<(usdtWei/step)*perStep){
          usdtWei+=10n**16n;
          rndWei=usdtWei*10n**18n/priceWei;
          pr=await readLocker.previewReward(usdtWei,rndWei);
          bumped=true;
        }
      }catch(e){}
      if(seq!==quoteSeq)return;
      if(rndWei<=0n)throw new Error('Amount is too small to quote.');
      if(bumped)$('usdtAmount').value=ethers.formatUnits(usdtWei,18);
      $('rndAmount').value=ethers.formatUnits(rndWei,18);
      let note=`Live on-chain price: ${fmt(Number(ethers.formatUnits(priceWei,18)),8)} USDT per RND. Final amounts may adjust slightly to pool ratio and slippage.`;
      if(bumped)note+=' (Rounding ki wajah se reward na kate, isliye USDT me 0.01 add kiya gaya.)';
      if(pr){
        if(pr.userReward>0n){
          note+=` Reward: ${fmt(Number(ethers.formatUnits(pr.userReward,18)),4)} RND (180 din ke lock ke baad claim kar sakenge).`;
          if(pr.referralReward>0n)note+=` Referral reward: ${fmt(Number(ethers.formatUnits(pr.referralReward,18)),4)} RND.`;
        }else{
          note+=` ⚠ Reward nahi milega: reward ke liye kam se kam ${fmt(Number(ethers.formatUnits(step,18)),2)} USDT matched value chahiye. Liquidity phir bhi add ho sakti hai, par reward 0 rahega.`;
        }
      }
      $('quoteNote').textContent=note;
    }catch(e){
      if(seq===quoteSeq){
        $('rndAmount').value='';
        $('quoteNote').textContent=/config\.js/.test(parseErr(e))?parseErr(e):'Live RND price could not be read from the locker contract. Please check BNB Chain connection and contract status.';
      }
    }
  }
  async function calculateMinimums(usdtDesired,rndDesired){
    const pair=new ethers.Contract(C.lpPair,['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)'],readProvider||browserProvider);
    const [t0,res]=await Promise.all([pair.token0(),pair.getReserves()]);const r0=BigInt(res[0]),r1=BigInt(res[1]);if(r0===0n||r1===0n)return [0n,0n];
    const rndIs0=t0.toLowerCase()===C.rnd.toLowerCase();const reserveRnd=rndIs0?r0:r1;const reserveUsdt=rndIs0?r1:r0;
    const usdtOptimal=rndDesired*reserveUsdt/reserveRnd;let useUsdt,useRnd;
    if(usdtOptimal<=usdtDesired){useUsdt=usdtOptimal;useRnd=rndDesired;}else{useUsdt=usdtDesired;useRnd=usdtDesired*reserveRnd/reserveUsdt;}
    return [useUsdt*995n/1000n,useRnd*995n/1000n];
  }
  async function ensureTokenApproval(which,needed){
    const token=which==='usdt'?tokenContracts.usdt:tokenContracts.rnd;
    const allowance=await token.allowance(account,C.locker);
    if(allowance>=needed)return;
    const label=which.toUpperCase();
    status('liquidityStatus',`Please approve ${label} in your wallet (sirf pehli baar; agli baar nahi puchhega).`);
    const tx=await token.approve(C.locker,ethers.MaxUint256); // ek baar max approve: agli baar approval confirmation nahi chahiye
    status('liquidityStatus',`${label} approval submitted. Waiting for confirmation…`,txUrl(tx.hash));
    await tx.wait();
  }
  async function addLiquidity(){
    const btn=$('addLiquidityBtn');
    try{
      if(!account)await ensureBsc();
      const c=connectedLocker();
      // Ensure RND amount is fresh from live price
      await quoteRNDFromUSDT();
      const u=cleanAmount($('usdtAmount').value),r=cleanAmount($('rndAmount').value);
      if(!u||!r)throw new Error('USDT amount daalein; RND live price se auto-calculate hoga.');
      btn.disabled=true;btn.textContent='Checking…';
      const [uDec,rDec]=await Promise.all([tokenContracts.usdt.decimals(),tokenContracts.rnd.decimals()]);
      if(Number(uDec)!==18||Number(rDec)!==18)throw new Error('Unexpected token decimals. This interface expects 18-decimal USDT and RND.');
      const ua=units(u,18),rq=units(r,18);
      const [ub,rb]=await Promise.all([tokenContracts.usdt.balanceOf(account),tokenContracts.rnd.balanceOf(account)]);
      if(ub<ua)throw new Error(`USDT balance kam hai. Zaroorat ${u} USDT, wallet me ${human(ub)} USDT.`);
      if(rb<rq)throw new Error(`RND balance kam hai. Zaroorat ${r} RND, wallet me ${human(rb)} RND.`);
      // 0.5% buffer (kam pade to wallet balance tak); extra RND contract wapas refund kar deta hai
      const raBuf=rq*1005n/1000n;const ra=raBuf<=rb?raBuf:rb;
      const existing=await c.getUserInfo(account);
      let ref=existing.registered?existing.referrer:(referralFromUrl||zero);
      if(!existing.registered && ref!==zero){
        if(ref.toLowerCase()===account.toLowerCase())throw new Error('You cannot use your own referral link.');
        const refInfo=await c.getUserInfo(ref);
        if(!refInfo.registered)throw new Error('Referral wallet is not registered on the locker yet. Use a registered referral link or continue without referral.');
      }
      try{
        const pr=await readLocker.previewReward(ua,rq);
        if(pr.userReward===0n){
          if(!confirm('Is amount par reward calculate nahi ho raha (minimum value se kam).\n\nLiquidity add ho jayegi lekin reward nahi milega. Phir bhi continue karein?'))throw new Error('Cancelled: transaction nahi bheji gayi.');
        }
      }catch(e){if(/^Cancelled/.test(e.message))throw e;}
      showBusy('Processing…','Aapke wallet me confirmation maanga ja raha hai. Wallet kholkar Confirm dabayein aur wait karein.');
      btn.textContent='Approving tokens…';
      await ensureTokenApproval('usdt',ua);await ensureTokenApproval('rnd',ra);
      const [uMin,rMin]=await calculateMinimums(ua,ra);const deadline=Math.floor(Date.now()/1000)+1200;
      btn.textContent='Confirm in wallet…';status('liquidityStatus','Please confirm Add Liquidity & Lock in your wallet.');
      const tx=await c.addLiquidityAndLock(ua,ra,uMin,rMin,ref,deadline);
      btn.textContent='Waiting for confirmation…';
      status('liquidityStatus','Transaction submitted. Waiting for BNB Chain confirmation…',txUrl(tx.hash));
      const receipt=await tx.wait();
      let detail='';
      try{
        for(const log of receipt.logs){
          let parsed=null;try{parsed=c.interface.parseLog(log);}catch(e){}
          if(parsed&&parsed.name==='LiquidityAddedAndLocked'){
            const a=parsed.args;
            detail=` Position #${a.positionId} · ${human(a.usdtUsed)} USDT + ${human(a.rndUsed)} RND locked · Reward: ${human(a.userReward)} RND.`;
            break;
          }
        }
      }catch(e){}
      status('liquidityStatus','Liquidity added and 180-day position recorded on-chain.'+detail,txUrl(tx.hash));
      toast('LP position created successfully.');
      $('usdtAmount').value='';$('rndAmount').value='';
      $('quoteNote').textContent='Enter USDT amount. RND will be calculated automatically using the live on-chain RND/USDT price.';
      await loadAll();
    }catch(e){status('liquidityStatus',parseErr(e));toast(parseErr(e));}
    finally{hideBusy();btn.disabled=false;btn.textContent='Add Liquidity & Lock';}
  }
  async function claimPosition(id){
    try{
      const c=connectedLocker();
      await ensureRead();
      const p=await readLocker.getPosition(id);
      const need=p.rewardAmount+p.referralRewardAmount;
      if(need===0n){toast('Is position par reward 0 hai.');return;}
      const bal=await readLocker.rewardReserveBalance();
      if(bal<need){toast(`Reward reserve me abhi itna RND nahi hai (zaroorat ${human(need)} RND). Reward funding ke baad claim karein.`);return;}
      if(!confirm(`Claim rewards for LP position #${id}? This pays the recorded user and referrer, if any.`))return;
      showBusy('Claiming rewards…','Wallet me confirm karein aur wait karein.');
      const tx=await c.claimRewards(id);
      updateBusy('Claim submitted. Waiting for confirmation…',txUrl(tx.hash));
      await tx.wait();toast('Reward claim confirmed.');await loadAll();
    }catch(e){toast(parseErr(e));}finally{hideBusy();}
  }
  async function withdrawPosition(id){
    try{
      const c=connectedLocker();
      if(!confirm(`Withdraw LP position #${id}? The contract will remove liquidity and send the returned USDT and RND to your wallet.`))return;
      await ensureRead();
      const p=await readLocker.getPosition(id);
      const pair=new ethers.Contract(C.lpPair,['function token0() view returns(address)','function totalSupply() view returns(uint256)','function getReserves() view returns(uint112,uint112,uint32)'],readProvider);
      const [t0,supply,res]=await Promise.all([pair.token0(),pair.totalSupply(),pair.getReserves()]);
      const rndIs0=t0.toLowerCase()===C.rnd.toLowerCase();
      const rR=BigInt(rndIs0?res[0]:res[1]),rU=BigInt(rndIs0?res[1]:res[0]);
      const minU=p.lpAmount*rU/supply*98n/100n,minR=p.lpAmount*rR/supply*98n/100n; // 2% slippage protection
      const deadline=Math.floor(Date.now()/1000)+1200;
      showBusy('Withdrawing LP…','Wallet me confirm karein aur wait karein.');
      const tx=await c.withdrawLP(id,minU,minR,deadline);
      updateBusy('Withdrawal submitted. Waiting for confirmation…',txUrl(tx.hash));
      await tx.wait();toast('LP withdrawal confirmed.');await loadAll();
    }catch(e){toast(parseErr(e));}finally{hideBusy();}
  }
  async function loadHistory(){try{await ensureRead();if(!account)throw new Error('Connect wallet first.');const end=await readProvider.getBlockNumber();const from=Math.max(Number(C.deploymentBlock)||0,end-50000);const filters=[readLocker.filters.LiquidityAddedAndLocked(null,account,null),readLocker.filters.LiquidityAddedAndLocked(null,null,account),readLocker.filters.LPWithdrawn(null,account),readLocker.filters.RewardsClaimed(null,account),readLocker.filters.RewardsClaimed(null,null,account),readLocker.filters.UserRegistered(account),readLocker.filters.ReferralRewardAccrued(account),readLocker.filters.ReferralRewardAccrued(null,account)];let all=[];for(const f of filters){try{all.push(...await readLocker.queryFilter(f,from,end));}catch(e){}}
    const uniq=[...new Map(all.map(x=>[x.transactionHash+String(x.index),x])).values()].sort((a,b)=>b.blockNumber-a.blockNumber).slice(0,40);const box=$('historyList');box.innerHTML='';if(!uniq.length){box.textContent=`No matching events found in the scanned block range (${from.toLocaleString()}–${end.toLocaleString()}). Set deploymentBlock in config.js to your contract deployment block for a complete history scan.`;return;}
    for(const ev of uniq){const row=document.createElement('div');row.className='history-row';const n=document.createElement('b');n.textContent=ev.fragment?.name||'Contract event';const block=document.createElement('span');block.textContent=`Block ${ev.blockNumber}`;const time=document.createElement('span');time.textContent='On-chain event';const a=document.createElement('a');a.href=txUrl(ev.transactionHash);a.target='_blank';a.rel='noopener';a.textContent='View tx ↗';row.append(n,block,time,a);box.append(row);}
  }catch(e){$('historyList').textContent=parseErr(e);}}
  async function copyReferral(){const v=$('referralLink').value;if(!account){toast('Connect your wallet first.');return;}try{await navigator.clipboard.writeText(v);toast('Referral link copied.');}catch(e){$('referralLink').select();document.execCommand('copy');toast('Referral link copied.');}}
  function initReferral(){const params=new URLSearchParams(location.search);const ref=params.get('ref');if(ref&&ethers.isAddress(ref)&&ref.toLowerCase()!==zero.toLowerCase()){referralFromUrl=ref;}}
  $('connectBtn').addEventListener('click',connect);$('addLiquidityBtn').addEventListener('click',addLiquidity);$('copyReferralBtn').addEventListener('click',copyReferral);$('refreshBtn').addEventListener('click',loadAll);$('historyBtn').addEventListener('click',loadHistory);$('usdtAmount').addEventListener('input',quoteRNDFromUSDT);$('year').textContent=new Date().getFullYear();$('menuToggle').addEventListener('click',()=>$('mainNav').classList.toggle('open'));document.querySelectorAll('#mainNav a').forEach(a=>a.addEventListener('click',()=>$('mainNav').classList.remove('open')));
  let boundWalletProvider=null;
  function clearWalletSession(message='Wallet disconnected. Connect again.'){
    account=null;signer=null;locker=null;browserProvider=null;
    tokenContracts.usdt=null;tokenContracts.rnd=null;
    setConnectedUI();
    $('usdtBalance').textContent=$('rndBalance').textContent='Wallet balance: Connect wallet';
    $('positionsList').textContent=message;
    $('myPending').textContent='—';$('rewardPendingBig').innerHTML='— <small>RND</small>';
  }
  function bindWalletEvents(provider){
    if(!provider||boundWalletProvider===provider)return;
    boundWalletProvider=provider;
    provider.on?.('accountsChanged',accs=>{
      if(!accs||!accs.length){clearWalletSession();return;}
      clearWalletSession('Wallet account changed. Updating account data…');
      connect();
    });
    provider.on?.('chainChanged',()=>location.reload());
    provider.on?.('disconnect',()=>clearWalletSession());
  }
  // Wallet selection is handled by wallet.js; reconnect events are bound after connection.
  window.addEventListener('rndwallet:connected',e=>bindWalletEvents(e.detail?.provider));
  initReferral();setConnectedUI();
  loadStats().catch(e=>{ $('totalLp').textContent='Unavailable';toast(parseErr(e)); });
})();
