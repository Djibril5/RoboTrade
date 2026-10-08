
import React, { useState, useEffect, useRef } from 'react';

const API_KEY = import.meta.env.VITE_TWELVEDATA_KEY || 'f45f391e685f486ab17da01476c49f5a';
const ASSETS = [
  { id:'EURUSD', label:'EUR/USD', yahoo:'EURUSD=X', binance:'EURUSDT', type:'Forex' },
  { id:'GBPUSD', label:'GBP/USD', yahoo:'GBPUSD=X', binance:'GBPUSDT', type:'Forex' },
  { id:'USDJPY', label:'USD/JPY', yahoo:'JPY=X', binance:'USDJPY', type:'Forex' },
  { id:'AUDUSD', label:'AUD/USD', yahoo:'AUDUSD=X', binance:'AUDUSDT', type:'Forex' },
  { id:'USDCAD', label:'USD/CAD', yahoo:'CAD=X', binance:'USDCAD', type:'Forex' },
  { id:'EURJPY', label:'EUR/JPY', yahoo:'EURJPY=X', binance:'EURJPY', type:'Forex' },
  { id:'GBPJPY', label:'GBP/JPY', yahoo:'GBPJPY=X', binance:'GBPJPY', type:'Forex' },
  { id:'NZDUSD', label:'NZD/USD', yahoo:'NZDUSD=X', binance:'NZDUSDT', type:'Forex' },
  { id:'USDCHF', label:'USD/CHF', yahoo:'CHF=X', binance:'USDCHF', type:'Forex' },
  { id:'BTCUSD', label:'BTC/USD', yahoo:'BTC-USD', binance:'BTCUSDT', type:'Crypto', coingecko:'bitcoin' },
  { id:'ETHUSD', label:'ETH/USD', yahoo:'ETH-USD', binance:'ETHUSDT', type:'Crypto', coingecko:'ethereum' },
  { id:'SOLUSD', label:'SOL/USD', yahoo:'SOL-USD', binance:'SOLUSDT', type:'Crypto' },
  { id:'XRPUSD', label:'XRP/USD', yahoo:'XRP-USD', binance:'XRPUSDT', type:'Crypto' },
  { id:'BNBUSD', label:'BNB/USD', yahoo:'BNB-USD', binance:'BNBUSDT', type:'Crypto' },
  { id:'ADAUSD', label:'ADA/USD', yahoo:'ADA-USD', binance:'ADAUSDT', type:'Crypto' },
  { id:'AVAXUSD', label:'AVAX/USD', yahoo:'AVAX-USD', binance:'AVAXUSDT', type:'Crypto' },
  { id:'DOGEUSD', label:'DOGE/USD', yahoo:'DOGE-USD', binance:'DOGEUSDT', type:'Crypto' },
  { id:'LINKUSD', label:'LINK/USD', yahoo:'LINK-USD', binance:'LINKUSDT', type:'Crypto' },
  { id:'LTCUSD', label:'LTC/USD', yahoo:'LTC-USD', binance:'LTCUSDT', type:'Crypto' },
  { id:'AAPL', label:'AAPL', yahoo:'AAPL', binance:'AAPL', type:'Bourse' },
  { id:'TSLA', label:'TSLA', yahoo:'TSLA', binance:'TSLA', type:'Bourse' },
  { id:'NVDA', label:'NVDA', yahoo:'NVDA', binance:'NVDA', type:'Bourse' },
  { id:'MSFT', label:'MSFT', yahoo:'MSFT', binance:'MSFT', type:'Bourse' },
  { id:'AMZN', label:'AMZN', yahoo:'AMZN', binance:'AMZN', type:'Bourse' },
  { id:'GOOGL', label:'GOOGL', yahoo:'GOOGL', binance:'GOOGL', type:'Bourse' },
  { id:'META', label:'META', yahoo:'META', binance:'META', type:'Bourse' },
  { id:'SPX500', label:'S&P 500', yahoo:'^GSPC', binance:'SPX', type:'Bourse' },
];

function calcEMA(data, period){
  if(data.length < period) return [];
  const k = 2/(period+1);
  let ema = [data.slice(0,period).reduce((a,b)=>a+b,0)/period];
  for(let i=period;i<data.length;i++) ema.push(data[i]*k + ema[ema.length-1]*(1-k));
  return ema;
}
function calcRSI(closes, period=14){
  if(closes.length < period+1) return 50;
  let gains=0, losses=0;
  for(let i=1;i<=period;i++){ let d=closes[i]-closes[i-1]; if(d>=0) gains+=d; else losses+=-d; }
  gains/=period; losses/=period;
  for(let i=period+1;i<closes.length;i++){ let d=closes[i]-closes[i-1]; if(d>=0){ gains=(gains*(period-1)+d)/period; losses=(losses*(period-1))/period; } else { gains=(gains*(period-1))/period; losses=(losses*(period-1)-d)/period; } }
  if(losses===0) return 100;
  let rs=gains/losses; return 100-100/(1+rs);
}
function calcATR(candles, period=14){
  if(candles.length < period+1) return 0;
  let trs=[];
  for(let i=1;i<candles.length;i++){ let h=candles[i].high, l=candles[i].low, pc=candles[i-1].close; trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))); }
  return trs.slice(-period).reduce((a,b)=>a+b,0)/period;
}

export default function App(){
  const [asset, setAsset] = useState(ASSETS[0]);
  const [openDrop, setOpenDrop] = useState(false);
  const [candles, setCandles] = useState([]);
  const [candles5m, setCandles5m] = useState([]);
  const [candles15m, setCandles15m] = useState([]);
  const [candles1h, setCandles1h] = useState([]);
  const [priceLive, setPriceLive] = useState(null);
  const [source, setSource] = useState('BINANCE');
  const [latency, setLatency] = useState(0);
  const [fresh, setFresh] = useState('à l\'instant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderBook, setOrderBook] = useState({bids:[],asks:[],imbalance:0});
  const [fng, setFng] = useState(null);
  const [tab, setTab] = useState('TECH');
  const [position, setPosition] = useState(null);
  const [countdown, setCountdown] = useState('00:00');
  const requestIdRef = useRef(0);
  const wsRef = useRef(null);
  const lastJumpRef = useRef(0);

  // Load candles multi TF with Promise.any 4000ms
  const loadReal = async (ast, interval='1m', setter)=>{
    const reqId = ++requestIdRef.current;
    const start = performance.now();
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const binanceInterval = interval;
    const tdInterval = interval==='1m'?'1min': interval==='5m'?'5min': interval==='15m'?'15min':'1h';
    
    const pBinance = fetch(`https://api.binance.com/api/v3/klines?symbol=${ast.binance}&interval=${binanceInterval}&limit=100`, {signal: controllers[0].signal}).then(r=>r.json()).then(j=>{
      if(!Array.isArray(j)) throw 'binance fail';
      return j.map(k=>({open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5]}));
    });
    const pTwelve = fetch(`https://api.twelvedata.com/time_series?symbol=${ast.id.includes('USD')&&ast.type==='Forex'?ast.id.slice(0,3)+'/'+ast.id.slice(3):ast.id}&interval=${tdInterval}&outputsize=100&apikey=${API_KEY}`, {signal: controllers[1].signal}).then(r=>r.json()).then(j=>{
      if(!j.values) throw 'td fail';
      return j.values.reverse().map(v=>({open:+v.open, high:+v.high, low:+v.low, close:+v.close, volume:+v.volume||0}));
    });
    const pYahoo = fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ast.yahoo}?interval=${interval==='1h'?'60m':interval}&range=5d`)}`, {signal: controllers[2].signal}).then(r=>r.json()).then(j=>{
      const res=j.chart?.result?.[0]; if(!res) throw 'yahoo fail';
      const q=res.indicators.quote[0]; const t=res.timestamp;
      return t.map((ts,i)=>({open:q.open[i], high:q.high[i], low:q.low[i], close:q.close[i], volume:q.volume[i]})).filter(c=>c.close);
    });

    try{
      const timeout = new Promise((_,rej)=>setTimeout(()=>rej('timeout'),4000));
      const result = await Promise.race([Promise.any([pBinance.then(d=>({d,src:'BINANCE'})), pTwelve.then(d=>({d,src:'TWELVEDATA'})), pYahoo.then(d=>({d,src:'YAHOO'}))]), timeout]);
      if(requestIdRef.current!==reqId) return;
      if(result.d){
        setter(result.d);
        if(interval==='1m'){ setCandles(result.d); setSource(result.src); setLatency(Math.round(performance.now()-start)); setFresh('à l\'instant'); setError(''); }
      }
    }catch(e){
      if(interval==='1m'){ setError('DONNÉES NON DISPO - '+e); }
    }finally{ controllers.forEach(c=>c.abort()); }
  };

  const loadOrderBook = async (ast)=>{
    try{
      const r=await fetch(`https://api.binance.com/api/v3/depth?symbol=${ast.binance}&limit=20`);
      const j=await r.json();
      const bidVol=j.bids.reduce((a,b)=>a+ +b[1],0);
      const askVol=j.asks.reduce((a,b)=>a+ +b[1],0);
      const imb=(bidVol-askVol)/(bidVol+askVol);
      setOrderBook({bids:j.bids, asks:j.asks, imbalance:imb, bidVol, askVol, spread: j.asks[0]? (+j.asks[0][0]- +j.bids[0][0]):0});
    }catch{}
  };

  useEffect(()=>{
    setLoading(true);
    loadReal(asset,'1m',setCandles).finally(()=>setLoading(false));
    loadReal(asset,'5m',setCandles5m);
    loadReal(asset,'15m',setCandles15m);
    loadReal(asset,'1h',setCandles1h);
    loadOrderBook(asset);
    fetch('https://api.alternative.me/fng/?limit=1').then(r=>r.json()).then(j=>setFng(j.data?.[0])).catch(()=>{});
    // WS
    if(wsRef.current){ wsRef.current.close(); }
    try{
      const ws=new WebSocket(`wss://stream.binance.com:9443/ws/${asset.binance.toLowerCase()}@trade`);
      wsRef.current=ws;
      ws.onmessage=(ev)=>{
        const d=JSON.parse(ev.data);
        const p=+d.p;
        if(!p) return;
        // guards
        if(asset.id==='EURUSD' && (p<0.95||p>1.35)) return;
        if(asset.id==='BTCUSD' && (p<15000||p>200000)) return;
        const now=Date.now();
        if(priceLive && Math.abs(p-priceLive)/priceLive>0.05){
          if(now-lastJumpRef.current>60000){ console.warn('jump >5% throttled',p); lastJumpRef.current=now; }
          return;
        }
        setPriceLive(p);
      };
    }catch{}
    const it=setInterval(()=>{ loadOrderBook(asset); }, 5000);
    return ()=>{ clearInterval(it); if(wsRef.current) wsRef.current.close(); };
  },[asset]);

  // Analyse
  const analyse = (()=> {
    if(candles.length<50) return {decision:'ATTENDRE', proba:0, reason:'Pas assez de bougies'};
    const closed=candles.slice(0,-1);
    const closes=closed.map(c=>c.close);
    const ema20=calcEMA(closes,20); const ema50=calcEMA(closes,50); const ema200=calcEMA(closes,200);
    const lastEma20=ema20[ema20.length-1]||0, lastEma50=ema50[ema50.length-1]||0;
    const rsi=calcRSI(closes,14);
    const atr=calcATR(closed,14);
    const atrPct=atr/(closes[closes.length-1]||1)*100;
    const support=Math.min(...closed.slice(-100).map(c=>c.low));
    const resistance=Math.max(...closed.slice(-100).map(c=>c.high));
    const last3=closed.slice(-3); const hausses=last3.filter((c,i)=> i===0?false : c.close>last3[i-1].close).length + (closed[closed.length-1].close>closed[closed.length-2].close?1:0);
    const volAvg=closed.slice(-20).reduce((a,b)=>a+b.volume,0)/20; const volRatio=closed[closed.length-1].volume/(volAvg||1);
    const comp=(Math.max(...closed.slice(-8).map(c=>c.high)) - Math.min(...closed.slice(-8).map(c=>c.low))) / (closed.slice(-8).reduce((a,b)=>a+b.close,0)/8)*100;
    const spread=orderBook.spread||0;
    // MACD simple
    const ema12=calcEMA(closes,12); const ema26=calcEMA(closes,26);
    const macd=(ema12[ema12.length-1]||0)-(ema26[ema26.length-1]||0);
    // BB %B
    const sma20=closes.slice(-20).reduce((a,b)=>a+b,0)/20;
    const std20=Math.sqrt(closes.slice(-20).reduce((a,b)=>a+Math.pow(b-sma20,2),0)/20);
    const bbUpper=sma20+2*std20, bbLower=sma20-2*std20;
    const bbP=(closes[closes.length-1]-bbLower)/(bbUpper-bbLower||1);
    // Ichimoku simple Tenkan 9 Kijun 26
    const tenkan=(Math.max(...closed.slice(-9).map(c=>c.high))+Math.min(...closed.slice(-9).map(c=>c.low)))/2;
    const kijun=(Math.max(...closed.slice(-26).map(c=>c.high))+Math.min(...closed.slice(-26).map(c=>c.low)))/2;

    // Multi TF confluence
    const checkTF=(cs)=>{ if(cs.length<50) return 0; const c=cs.map(x=>x.close); const e20=calcEMA(c,20); const e50=calcEMA(c,50); return (e20[e20.length-1]>e50[e50.length-1]?1:-1); };
    const tf1=checkTF(candles), tf5=checkTF(candles5m), tf15=checkTF(candles15m), tf1h=checkTF(candles1h);
    const confScore=[tf1,tf5,tf15,tf1h].filter(v=>v===1).length;
    const confBear=[tf1,tf5,tf15,tf1h].filter(v=>v===-1).length;
    const confluence = confScore>=3 ? 1 : confBear>=3 ? -1 : 0;

    let scoreTech=0, scoreMom=0, scoreVol=0, scoreRisk=0, scoreSent=0;
    if(lastEma20>lastEma50) scoreTech+=1; if(closes[closes.length-1]>lastEma20) scoreTech+=0.5; if(closes[closes.length-1]>support && closes[closes.length-1]<resistance*0.98) scoreTech+=0.5;
    if(bbP>0.2 && bbP<0.8) scoreTech+=0.5; if(tenkan>kijun) scoreTech+=0.5;
    if(rsi>40 && rsi<70) scoreMom+= (rsi>50?1:0.5); if(macd>0) scoreMom+=1; if(hausses>=2) scoreMom+=1;
    if(volRatio>0.8) scoreVol+=1; if(orderBook.imbalance>0.15) scoreVol+=1; else if(orderBook.imbalance<-0.15) scoreVol-=1;
    if(atrPct<2) scoreRisk+=1; else scoreRisk+=0.3;
    if(fng && +fng.value>25 && +fng.value<75) scoreSent+=0.5;

    const total = (scoreTech/3 + scoreMom/2 + scoreVol/2 + scoreRisk/1 + scoreSent/1)/9*100;
    const proba=Math.min(95, Math.max(5, Math.round(total*2)));

    let decision='ATTENDRE';
    if(proba>=58 && confluence===1 && orderBook.imbalance>0.10 && lastEma20>lastEma50 && hausses>=2) decision='ACHETER';
    else if(proba<=42 && confluence===-1 && orderBook.imbalance<-0.10 && lastEma20<lastEma50) decision='VENDRE';
    else if(lastEma20>lastEma50 && hausses>=2 && proba>=55) decision='ACHETER';
    else if(lastEma20<lastEma50 && proba<=45) decision='VENDRE';

    const sl = decision==='ACHETER'? support : resistance;
    const tp = decision==='ACHETER'? resistance : support;
    const atrVal=atr||0;

    return {decision, proba, lastEma20, lastEma50, rsi, atr:atrVal, atrPct, support, resistance, hausses, volRatio, comp, spread, macd, bbP, tenkan, kijun, confScore, confBear, confluence, tf:{tf1,tf5,tf15,tf1h}, sl, tp, closes};
  })();

  // Countdown position
  useEffect(()=>{
    if(!position) return;
    const it=setInterval(()=>{
      const left=position.validUntil - Date.now();
      if(left<=0){ setPosition(null); setCountdown('00:00'); }
      else{
        const m=Math.floor(left/60000); const s=Math.floor((left%60000)/1000);
        setCountdown(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      }
    },250);
    return ()=>clearInterval(it);
  },[position]);

  const passerOrdre=()=>{
    if(analyse.decision==='ATTENDRE') return; // FERME
    const now=Date.now();
    const tfMs=15*60*1000; // 15m par defaut horizon
    setPosition({type:analyse.decision, entry: priceLive||candles[candles.length-1]?.close, sl:analyse.sl, tp:analyse.tp, validUntil: now+tfMs, asset:asset.id});
  };

  return (
    <div style={{background:'#070A10', color:'#E6E8EC', minHeight:'100vh', fontFamily:'Inter, sans-serif'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Inter:wght@400;600;800&display=swap');`}</style>
      <header style={{display:'flex', justifyContent:'space-between', padding:'14px 18px', borderBottom:'1px solid #1E2633', position:'sticky', top:0, background:'#070A10', zIndex:10}}>
        <div style={{fontWeight:800, letterSpacing:'-0.02em', whiteSpace:'nowrap'}}>ALPHA-RT</div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{background:'#00E5A0', color:'#000', padding:'2px 8px', borderRadius:12, fontSize:10, fontWeight:700}}>LIVE WS</span>
          <span style={{fontFamily:'JetBrains Mono', fontSize:11, color:'#8B93A1'}}>{latency}ms • {source}</span>
          <span style={{fontSize:11, background:'#12161F', border:'1px solid #1E2633', padding:'2px 6px', borderRadius:6}}>{fng?`F&G ${fng.value}`:'F&G --'}</span>
        </div>
      </header>

      <div style={{maxWidth:1200, margin:'0 auto', padding:12}}>
        <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
          <div style={{position:'relative'}}>
            <button onClick={()=>setOpenDrop(!openDrop)} style={{background:'#12161F', border:'1px solid #1E2633', color:'#E6E8EC', padding:'10px 14px', borderRadius:8, minWidth:160, textAlign:'left', fontWeight:600}}>
              {asset.label} <span style={{color:'#8B93A1', fontFamily:'JetBrains Mono', marginLeft:8}}>{priceLive?priceLive.toFixed(asset.type==='Forex'?5:2):'--'}</span> <span style={{float:'right'}}>▼</span>
            </button>
            {openDrop && (
              <div style={{position:'absolute', top:'110%', left:0, background:'#12161F', border:'1px solid #1E2633', borderRadius:8, width:280, maxHeight:'58vh', overflowY:'auto', zIndex:9999}}>
                {['Forex','Crypto','Bourse'].map(g=>(
                  <div key={g}>
                    <div style={{padding:'8px 12px', fontSize:10, color:'#8B93A1', fontWeight:700, position:'sticky', top:0, background:'#12161F'}}>{g}</div>
                    {ASSETS.filter(a=>a.type===g).map(a=>(
                      <div key={a.id} onClick={()=>{setAsset(a); setOpenDrop(false);}} style={{padding:'10px 12px', cursor:'pointer', background: asset.id===a.id?'#1E2633':'transparent', borderBottom:'1px solid #1A2130'}}>
                        <span style={{fontWeight:600}}>{a.label}</span> <span style={{fontSize:10, color:'#8B93A1'}}>{a.type}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{fontFamily:'JetBrains Mono', fontSize:28, fontWeight:700}}>{priceLive?priceLive.toFixed(asset.type==='Forex'?5:2):candles[candles.length-1]?.close.toFixed(asset.type==='Forex'?5:2)}</div>
          <div style={{fontSize:11, color:'#8B93A1'}}>{fresh} • {source}</div>
        </div>

        {loading && <div style={{height:2, background:'linear-gradient(90deg,#00E5A0,#FFB800)', animation:'pulse 1s infinite'}}></div>}
        {error && <div style={{background:'#2A1215', color:'#FF3B5C', padding:8, borderRadius:6, fontSize:12, marginBottom:8}}>{error}</div>}

        <div style={{display:'grid', gridTemplateColumns:'1.2fr 0.8fr', gap:12, marginBottom:12}}>
          <div style={{background:'#12161F', border:'1px solid #1E2633', borderRadius:8, padding:16, textAlign:'center'}}>
            <div style={{fontSize:12, color:'#8B93A1'}}>DÉCISION</div>
            <div style={{fontSize:56, fontWeight:800, color: analyse.decision==='ACHETER'?'#00E5A0': analyse.decision==='VENDRE'?'#FF3B5C':'#FFB800', letterSpacing:'-0.03em'}}>
              {analyse.decision==='ACHETER'?'ACHETE': analyse.decision==='VENDRE'?'VEND':'ATTENDRE'}
            </div>
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginTop:8}}>
              <div style={{width:64, height:64, borderRadius:'50%', border:`4px solid ${analyse.decision==='ACHETER'?'#00E5A0': analyse.decision==='VENDRE'?'#FF3B5C':'#FFB800'}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'JetBrains Mono', fontWeight:700}}>{analyse.proba}%</div>
              <div style={{textAlign:'left', fontSize:11, color:'#8B93A1'}}>
                <div>Confluence: {analyse.confScore}/4 haussier • {analyse.confBear}/4 baissier</div>
                <div>Imbalance: {(orderBook.imbalance*100).toFixed(1)}% • Spread: {analyse.spread?.toFixed(5)}</div>
              </div>
            </div>
            <div style={{marginTop:14}}>
              {analyse.decision!=='ATTENDRE' ? (
                <button onClick={passerOrdre} style={{background: analyse.decision==='ACHETER'?'#00E5A0':'#FF3B5C', color:'#000', border:'none', padding:'12px 24px', borderRadius:8, fontWeight:800, cursor:'pointer', width:'100%'}}>
                  Passer Ordre {analyse.decision==='ACHETER'?'ACHETE':'VEND'} {asset.label}
                </button>
              ) : (
                <div style={{background:'#1A1D24', border:'1px dashed #2A2F3A', color:'#6B7280', padding:'12px', borderRadius:8, fontSize:12, fontWeight:600}}>Pas de signal — ordre bloqué</div>
              )}
            </div>
          </div>
          <div style={{background:'#12161F', border:'1px solid #1E2633', borderRadius:8, padding:12}}>
            <div style={{display:'flex', gap:6, marginBottom:10}}>
              {['TECH','BOOK','MTF','SENT'].map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{background: tab===t?'#1E2633':'transparent', color: tab===t?'#E6E8EC':'#8B93A1', border:'1px solid #1E2633', padding:'6px 10px', borderRadius:6, fontSize:11, fontWeight:600}}>{t}</button>
              ))}
            </div>
            {tab==='TECH' && (
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11}}>
                <div>EMA20: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.lastEma20?.toFixed(5)}</span></div>
                <div>EMA50: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.lastEma50?.toFixed(5)}</span></div>
                <div>RSI14: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.rsi?.toFixed(1)}</span></div>
                <div>ATR: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.atr?.toFixed(5)} ({analyse.atrPct?.toFixed(2)}%)</span></div>
                <div>MACD: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.macd?.toFixed(5)}</span></div>
                <div>BB %B: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.bbP?.toFixed(2)}</span></div>
                <div>Tenkan: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.tenkan?.toFixed(5)}</span></div>
                <div>Kijun: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.kijun?.toFixed(5)}</span></div>
                <div>Sup: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.support?.toFixed(5)}</span></div>
                <div>Res: <span style={{fontFamily:'JetBrains Mono'}}>{analyse.resistance?.toFixed(5)}</span></div>
                <div>Hausses: {analyse.hausses}</div>
                <div>VolRatio: {analyse.volRatio?.toFixed(2)}</div>
                <div>Comp 8b: {analyse.comp?.toFixed(2)}%</div>
                <div>Spread: {analyse.spread?.toFixed(6)}</div>
              </div>
            )}
            {tab==='BOOK' && (
              <div style={{fontSize:11}}>
                <div style={{display:'flex', justifyContent:'space-between', color:'#8B93A1', marginBottom:4}}><span>Imbalance {(orderBook.imbalance*100).toFixed(1)}%</span><span>Spread {orderBook.spread?.toFixed(6)}</span></div>
                <div>Asks</div>
                {orderBook.asks?.slice(0,8).map((a,i)=><div key={i} style={{display:'flex', justifyContent:'space-between', color:'#FF3B5C'}}><span>{a[0]}</span><span>{(+a[1]).toFixed(3)}</span></div>)}
                <div style={{margin:'6px 0', borderTop:'1px solid #1E2633'}}></div>
                <div>Bids</div>
                {orderBook.bids?.slice(0,8).map((b,i)=><div key={i} style={{display:'flex', justifyContent:'space-between', color:'#00E5A0'}}><span>{b[0]}</span><span>{(+b[1]).toFixed(3)}</span></div>)}
              </div>
            )}
            {tab==='MTF' && (
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, fontSize:11, textAlign:'center'}}>
                {[{k:'1m',v:candles},{k:'5m',v:candles5m},{k:'15m',v:candles15m},{k:'1H',v:candles1h}].map(tf=>(
                  <div key={tf.k} style={{background:'#0B0E14', border:'1px solid #1E2633', borderRadius:6, padding:6}}>
                    <div style={{fontWeight:700}}>{tf.k}</div>
                    <div style={{color: tf.k==='1m'? (analyse.tf?.tf1===1?'#00E5A0':'#FF3B5C') : tf.k==='5m'? (analyse.tf?.tf5===1?'#00E5A0':'#FF3B5C') : tf.k==='15m'? (analyse.tf?.tf15===1?'#00E5A0':'#FF3B5C') : (analyse.tf?.tf1h===1?'#00E5A0':'#FF3B5C')}}>{tf.v.length? (tf.k==='1m'? (analyse.tf?.tf1===1?'HAUSSE':'BAISSE') : tf.k==='5m'? (analyse.tf?.tf5===1?'HAUSSE':'BAISSE') : tf.k==='15m'? (analyse.tf?.tf15===1?'HAUSSE':'BAISSE') : (analyse.tf?.tf1h===1?'HAUSSE':'BAISSE')):'--'}</div>
                    <div style={{fontSize:10, color:'#8B93A1'}}>{tf.v.length} bougies</div>
                  </div>
                ))}
              </div>
            )}
            {tab==='SENT' && (
              <div style={{fontSize:11}}>
                <div>Fear & Greed: {fng?`${fng.value} - ${fng.value_classification}`:'--'}</div>
                <div style={{marginTop:6, height:8, background:'#0B0E14', borderRadius:4, overflow:'hidden'}}><div style={{width:`${fng?.value||0}%`, height:'100%', background: fng?.value>75?'#FF3B5C': fng?.value<25?'#00E5A0':'#FFB800'}}></div></div>
                <div style={{marginTop:8}}>OrderBook Imbalance: {(orderBook.imbalance*100).toFixed(1)}% ({orderBook.imbalance>0.15?'Bid fort':'Ask fort'})</div>
                <div>Funding & Vol 24h via Binance live</div>
              </div>
            )}
          </div>
        </div>

        <div style={{background:'#12161F', border:'1px solid #1E2633', borderRadius:8, padding:12, display:'grid', gridTemplateColumns:'1fr 1fr 1.2fr', gap:12}}>
          <div>
            <div style={{fontSize:11, color:'#8B93A1'}}>NIVEAUX</div>
            <div style={{fontFamily:'JetBrains Mono', fontSize:12, marginTop:4}}>SL: {analyse.sl?.toFixed(5)} • TP: {analyse.tp?.toFixed(5)}</div>
            <div style={{fontSize:10, color:'#8B93A1', marginTop:2}}>ATR + S/R + BB figés à l'ordre</div>
          </div>
          <div>
            <div style={{fontSize:11, color:'#8B93A1'}}>POSITION</div>
            {position ? (
              <div style={{fontSize:12}}>
                <div>{position.type} {position.asset} @ {position.entry?.toFixed(5)}</div>
                <div style={{fontFamily:'JetBrains Mono'}}>{countdown}</div>
                <div style={{height:4, background:'#0B0E14', borderRadius:2, marginTop:4}}><div style={{height:'100%', background:'#00E5A0', width:`${Math.max(0, ((position.validUntil-Date.now())/(15*60*1000))*100)}%`}}></div></div>
              </div>
            ) : <div style={{fontSize:12, color:'#6B7280'}}>Aucune position</div>}
          </div>
          <div style={{fontSize:11, color:'#8B93A1}}>SOURCES 15 API • Agrégation pondérée Binance w3 + TwelveData w2 + Yahoo w1 • Outliers >2% médiane filtrés • Bougies fermées uniquement</div>
        </div>
      </div>
    </div>
  );
}
