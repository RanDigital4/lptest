(() => {
  'use strict';
  const C = window.RND_CONFIG;
  const $ = id => document.getElementById(id);
  const fmt = (v, digits=4) => Number(v).toLocaleString('en-US',{maximumFractionDigits:digits});
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  const zero = ethers.ZeroAddress;
  let browserProvider=null, signer=null, account=null, locker=null, readProvider=null, readLocker=null, toastTimer, quoteSeq=0, referralFromUrl=zero;
  const tokenContracts = {};
  const toast = msg => { const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),4300); };
  const status = (id,msg,link) => { const el=$(id); if(!el)return; el.textContent=msg; if(link){el.append(' ');const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener';a.textContent='View on BscScan ↗';el.append(a);} };
  const txUrl = hash => `${C.explorer}/tx/${hash}`;
  const addrUrl = address => `${C.explorer}/address/${address}`;
  const parseErr = e => e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || 'Transaction failed or was rejected.';
  const units = (v,dec=18) => ethers.parseUnits(String(v),dec);
  const human = (v,dec=18,d=4) => fmt(Number(ethers.formatUnits(v,dec)),d);
  function setConnectedUI(){
    $('connectBtn').textContent=account?short(account):'Connect Wallet';
    $('networkBadge').textContent=account?'● BNB Chain connected':'● Not connected';
    $('networkBadge').classList.toggle('good',!!account);
    $('referralLink').value=account?`${location.origin}${location.pathname}?ref=${account}`:'Connect wallet to generate your link';
  }
  async function ensureRead(){
    if(readLocker)return;
    for(const rpc of C.rpcUrls){try{const p=new ethers.JsonRpcProvider(rpc,56,{staticNetwork:true});const c=new ethers.Contract(C.locker,C.lockerAbi,p);await c.totalLPLocked();readProvider=p;readLocker=c;return;}catch(e){}}
    throw new Error('Could not connect to BNB Chain RPC endpoints.');
  }
  function connectedLocker(){if(!locker||!account)throw new Error('Connect your wallet first.');return locker;}
  async function ensureBsc(){
    if(!window.ethereum)throw new Error('No compatible wallet detected. Open this page in MetaMask or Trust Wallet browser, or install a wallet extension.');
    browserProvider=new ethers.BrowserProvider(window.ethereum);
    await browserProvider.send('eth_requestAccounts',[]);
    let net=await browserProvider.getNetwork();
    if(Number(net.chainId)!==56){
      try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:C.chainHex}]});}
      catch(e){if(e.code===4902){await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:C.chainHex,chainName:C.chainName,nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:C.rpcUrls,blockExplorerUrls:[C.explorer]}]});}else throw new Error('Please switch your wallet to BNB Smart Chain (Chain ID 56).');}
      browserProvider=new ethers.BrowserProvider(window.ethereum);net=await browserProvider.getNetwork();
    }
    if(Number(net.chainId)!==56)throw new Error('Wallet is not connected to BNB Smart Chain.');
    signer=await browserProvider.getSigner();account=await signer.getAddress();locker=new ethers.Contract(C.locker,C.lockerAbi,signer);
    tokenContracts.usdt=new ethers.Contract(C.usdt,C.erc20Abi,signer);tokenContracts.rnd=new ethers.Contract(C.rnd,C.erc20Abi,signer);
    setConnectedUI();await loadAll();await loadWalletBalances();toast('Wallet connected to BNB Smart Chain.');
  }
  async function connect(){try{await ensureBsc();}catch(e){toast(parseErr(e));}}
  async function loadStats(){
    await ensureRead();
    const [lp,out,users,reserve]=await Promise.all([readLocker.totalLPLocked(),readLocker.totalOutstandingRewards(),readLocker.totalRegisteredUsers(),readLocker.rewardReserveBalance()]);
    $('totalLp').textContent=human(lp,18,4);$('outstanding').textContent=`${human(out,18,2)} RND`;$('registered').textContent=fmt(Number(users),0);$('reserve').textContent=`${human(reserve,18,2)} RND`;$('reserveDetail').textContent=`${human(reserve,18,4)} RND`;
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
      const claim=document.createElement('button');claim.className='btn btn-gold';claim.textContent=rewardsClaimed?'Rewards claimed':mature?'Claim rewards':'Rewards locked';claim.disabled=rewardsClaimed||!mature;claim.onclick=()=>claimPosition(id);
      const withdraw=document.createElement('button');withdraw.className='btn btn-outline';withdraw.textContent=lpWithdrawn?'LP withdrawn':mature?'Withdraw LP':'Withdraw locked LP';withdraw.disabled=lpWithdrawn||!mature;withdraw.onclick=()=>withdrawPosition(id);
      actions.append(claim,withdraw);card.append(actions);list.append(card);
    }
    $('myPending').textContent=`${fmt(userPending,3)} RND`;$('rewardPendingBig').innerHTML=`${fmt(userPending,3)} <small>RND</small>`;$('claimedTotal').textContent=`${fmt(userClaimed,3)} RND`;
  }
  async function loadAll(){try{await loadStats();if(account){await loadAccount();await loadWalletBalances();}}catch(e){toast(parseErr(e));}}
  async function loadWalletBalances(){if(!account)return;try{const [u,r]=await Promise.all([tokenContracts.usdt.balanceOf(account),tokenContracts.rnd.balanceOf(account)]);$('usdtBalance').textContent=`Wallet: ${human(u,18,4)} USDT`;$('rndBalance').textContent=`Wallet: ${human(r,18,4)} RND`;}catch(e){$('usdtBalance').textContent=$('rndBalance').textContent='Wallet balance unavailable';}}
  async function quoteRNDFromUSDT(){
    const raw=$('usdtAmount').value;const seq=++quoteSeq;
    if(!raw||!/^[0-9]+(\\.[0-9]*)?$/.test(raw)||Number(raw)<=0){
      $('rndAmount').value='';
      $('quoteNote').textContent='Enter USDT amount. RND will be calculated automatically using the live on-chain RND/USDT price.';
      return;
    }
    try{
      await ensureRead();
      const priceWei=await readLocker.getSpotPriceRNDInUSDT();
      if(priceWei<=0n)throw new Error('Live RND price is unavailable.');
      const usdtWei=units(raw,18);
      const rndWei=usdtWei*10n**18n/priceWei;
      if(seq!==quoteSeq)return;
      if(rndWei<=0n)throw new Error('Amount is too small to quote.');
      $('rndAmount').value=ethers.formatUnits(rndWei,18);
      $('quoteNote').textContent=`Live on-chain spot price: ${fmt(Number(ethers.formatUnits(priceWei,18)),8)} USDT per RND. Final amounts may adjust to pool ratio and slippage.`;
    }catch(e){
      if(seq===quoteSeq){
        $('rndAmount').value='';
        $('quoteNote').textContent='Live RND price could not be read from the locker contract. Please check BNB Chain connection and contract status.';
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
  async function ensureTokenApproval(which,needed){const token=which==='usdt'?tokenContracts.usdt:tokenContracts.rnd;let allowance=await token.allowance(account,C.locker);if(allowance>=needed)return;const label=which.toUpperCase();status('liquidityStatus',`Please approve ${label} in your wallet. This is a separate one-time/allowance transaction.`);if(which==='usdt' && allowance>0n){const reset=await token.approve(C.locker,0);status('liquidityStatus',`${label} allowance reset submitted.`,txUrl(reset.hash));await reset.wait();}const tx=await token.approve(C.locker,needed);status('liquidityStatus',`${label} approval submitted.`,txUrl(tx.hash));await tx.wait();}
  async function addLiquidity(){
    const btn=$('addLiquidityBtn');try{
      const c=connectedLocker();const u=$('usdtAmount').value,r=$('rndAmount').value;if(!u||!r||Number(u)<=0||Number(r)<=0)throw new Error('Enter both USDT and RND amounts.');
      const [uDec,rDec]=await Promise.all([tokenContracts.usdt.decimals(),tokenContracts.rnd.decimals()]);if(Number(uDec)!==18||Number(rDec)!==18)throw new Error('Unexpected token decimals. This interface expects 18-decimal USDT and RND as specified by the contract.');
      const ua=units(u,18),ra=units(r,18);
      const existing=await c.getUserInfo(account);
      let ref=existing.registered?existing.referrer:(referralFromUrl||zero);
      if(!existing.registered && ref!==zero){if(ref.toLowerCase()===account.toLowerCase())throw new Error('You cannot use your own referral link.');const refInfo=await c.getUserInfo(ref);if(!refInfo.registered)throw new Error('Referral wallet is not registered on the locker yet. Use a registered referral link or continue without referral.');}
      // Automatically request missing approvals from the single LP button. BEP-20 still requires separate wallet confirmations for each missing token allowance.
      btn.disabled=true;btn.textContent='Checking token approvals…';
      await ensureTokenApproval('usdt',ua);await ensureTokenApproval('rnd',ra);
      const [uMin,rMin]=await calculateMinimums(ua,ra);const deadline=Math.floor(Date.now()/1000)+1200;
      btn.textContent='Confirm Add Liquidity & Lock…';status('liquidityStatus','Please confirm Add Liquidity & Lock in your wallet.');
      const tx=await c.addLiquidityAndLock(ua,ra,uMin,rMin,ref,deadline);status('liquidityStatus','Transaction submitted. Waiting for BNB Chain confirmation…',txUrl(tx.hash));await tx.wait();status('liquidityStatus','Liquidity added and 180-day position recorded on-chain.',txUrl(tx.hash));toast('LP position created successfully.');await loadAll();
    }catch(e){status('liquidityStatus',parseErr(e));toast(parseErr(e));}finally{btn.disabled=false;btn.textContent='Add Liquidity & Lock';}
  }
  async function claimPosition(id){try{const c=connectedLocker();if(!confirm(`Claim rewards for LP position #${id}? This pays the recorded user and referrer, if any.`))return;const tx=await c.claimRewards(id);toast('Claim submitted. Waiting for confirmation…');await tx.wait();toast('Reward claim confirmed.');await loadAll();}catch(e){toast(parseErr(e));}}
  async function withdrawPosition(id){try{const c=connectedLocker();if(!confirm(`Withdraw LP position #${id}? The contract will remove liquidity and send the returned USDT and RND to your wallet.`))return;const deadline=Math.floor(Date.now()/1000)+1200;const tx=await c.withdrawLP(id,0,0,deadline);toast('LP withdrawal submitted. Waiting for confirmation…');await tx.wait();toast('LP withdrawal confirmed.');await loadAll();}catch(e){toast(parseErr(e));}}
  async function loadHistory(){try{await ensureRead();if(!account)throw new Error('Connect wallet first.');const end=await readProvider.getBlockNumber();const from=Math.max(Number(C.deploymentBlock)||0,end-50000);const filters=[readLocker.filters.LiquidityAddedAndLocked(null,account,null),readLocker.filters.LiquidityAddedAndLocked(null,null,account),readLocker.filters.LPWithdrawn(null,account),readLocker.filters.RewardsClaimed(null,account),readLocker.filters.RewardsClaimed(null,null,account),readLocker.filters.UserRegistered(account),readLocker.filters.ReferralRewardAccrued(account),readLocker.filters.ReferralRewardAccrued(null,account)];let all=[];for(const f of filters){try{all.push(...await readLocker.queryFilter(f,from,end));}catch(e){}}
    const uniq=[...new Map(all.map(x=>[x.transactionHash+String(x.index),x])).values()].sort((a,b)=>b.blockNumber-a.blockNumber).slice(0,40);const box=$('historyList');box.innerHTML='';if(!uniq.length){box.textContent=`No matching events found in the scanned block range (${from.toLocaleString()}–${end.toLocaleString()}). Set deploymentBlock in config.js to your contract deployment block for a complete history scan.`;return;}
    for(const ev of uniq){const row=document.createElement('div');row.className='history-row';const n=document.createElement('b');n.textContent=ev.fragment?.name||'Contract event';const block=document.createElement('span');block.textContent=`Block ${ev.blockNumber}`;const time=document.createElement('span');time.textContent='On-chain event';const a=document.createElement('a');a.href=txUrl(ev.transactionHash);a.target='_blank';a.rel='noopener';a.textContent='View tx ↗';row.append(n,block,time,a);box.append(row);}
  }catch(e){$('historyList').textContent=parseErr(e);}}
  async function copyReferral(){const v=$('referralLink').value;if(!account){toast('Connect your wallet first.');return;}try{await navigator.clipboard.writeText(v);toast('Referral link copied.');}catch(e){$('referralLink').select();document.execCommand('copy');toast('Referral link copied.');}}
  function initReferral(){const params=new URLSearchParams(location.search);const ref=params.get('ref');if(ref&&ethers.isAddress(ref)&&ref.toLowerCase()!==zero.toLowerCase()){referralFromUrl=ref;}}
  $('connectBtn').addEventListener('click',connect);$('addLiquidityBtn').addEventListener('click',addLiquidity);$('copyReferralBtn').addEventListener('click',copyReferral);$('refreshBtn').addEventListener('click',loadAll);$('historyBtn').addEventListener('click',loadHistory);$('usdtAmount').addEventListener('input',quoteRNDFromUSDT);$('year').textContent=new Date().getFullYear();$('menuToggle').addEventListener('click',()=>$('mainNav').classList.toggle('open'));document.querySelectorAll('#mainNav a').forEach(a=>a.addEventListener('click',()=>$('mainNav').classList.remove('open')));
  if(window.ethereum){window.ethereum.on?.('accountsChanged',()=>{account=null;signer=null;locker=null;tokenContracts.usdt=null;tokenContracts.rnd=null;setConnectedUI();$('usdtBalance').textContent=$('rndBalance').textContent='Wallet balance: Connect wallet';$('positionsList').textContent='Wallet changed. Reconnect to load your positions.';});window.ethereum.on?.('chainChanged',()=>location.reload());}
  initReferral();setConnectedUI();loadStats().catch(e=>{ $('totalLp').textContent='Unavailable';toast(parseErr(e)); });
})();
