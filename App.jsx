import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Share2, Settings, History, Dumbbell, AlertTriangle, CheckCircle2, XCircle, ChevronUp, ChevronDown } from 'lucide-react';

// --- CONFIG & CONSTANTS ---
const COLORS = {
  bg: '#0E0F11',
  surface: '#1A1C20',
  textMain: '#F4F2EC',
  textSec: '#8B8F98',
  accent: '#B6FF3B',
};

const BORDER_RADIUS = '12px';

// --- HELPER: AUDIO BEEP ---
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.error("Audio error", e);
  }
};

// --- HELPER: DYNAMIC SCRIPT LOADER ---
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const script = document.createElement('script');
  script.src = src;
  script.crossOrigin = "anonymous";
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

// --- HELPER: MATH FOR POSE ---
const getAngle = (a, b, c) => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

// --- API: GEMINI / MOCK ---
const evaluateSession = async (goal, reps, durationSec, avgDepth, apiKey) => {
  const prompt = `Evaluate this pushup session: goal ${goal}, completed ${reps}, duration ${durationSec.toFixed(1)}s, avg depth ${avgDepth.toFixed(1)} degrees. Respond ONLY with valid JSON: { "verdict": "Débloqué" or "Encore bloqué", "score": 0-100 (integer), "pointsForts": "1 short sentence in French", "aCorriger": "1 short sentence in French", "defi": "1 short sentence in French, direct tone, tutoiement" }`;

  const fallbackMock = () => {
    const success = reps >= goal;
    let score = success ? Math.min(100, 80 + (reps - goal) * 2) : Math.max(0, Math.round((reps / goal) * 80));
    return {
      verdict: success ? "Débloqué" : "Encore bloqué",
      score: score,
      pointsForts: reps > 5 ? "Tu as un rythme solide et constant." : "Bon effort pour avoir essayé.",
      aCorriger: avgDepth > 85 ? "Descends plus bas, vise moins de 80 degrés d'angle." : "Essaie de garder ton corps bien aligné.",
      defi: success ? `Prochaine fois, on vise ${goal + 5}, cap ?` : `Ne lâche rien, refais-en ${goal} demain !`
    };
  };

  if (!apiKey) return fallbackMock();

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    if (!res.ok) throw new Error("API Error");
    const data = await res.json();
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (error) {
    console.warn("Gemini API failed, using fallback mock", error);
    return fallbackMock();
  }
};

// --- COMPONENTS ---
const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "flex items-center justify-center font-barlow font-semibold text-lg transition-all active:scale-[0.97] active:opacity-80 disabled:opacity-50 disabled:active:scale-100";
  const variants = {
    primary: `bg-[#B6FF3B] text-[#0E0F11]`,
    secondary: `bg-[#1A1C20] text-[#F4F2EC]`,
  };
  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`} 
      style={{ borderRadius: BORDER_RADIUS, minHeight: '48px' }}
      {...props}
    >
      {children}
    </button>
  );
};

// --- MAIN APP COMPONENT ---
export default function Unlockfit() {
  const [view, setView] = useState('loading');
  const [tab, setTab] = useState('seance');
  const [goal, setGoal] = useState(10);
  const [apiKey, setApiKey] = useState('');
  const [history, setHistory] = useState([]);
  
  const [sessionData, setSessionData] = useState(null);
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState(null);
  const [evaluationResult, setEvaluationResult] = useState(null);

  useEffect(() => {
    const seen = localStorage.getItem('unlockfit_has_seen_intro');
    const savedKey = localStorage.getItem('unlockfit_api_key') || '';
    const savedHistory = JSON.parse(localStorage.getItem('unlockfit_history') || '[]');
    setApiKey(savedKey);
    setHistory(savedHistory);
    setView(seen ? 'main' : 'onboarding');
    
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;800&family=Barlow:wght@400;600&display=swap');
      .font-barlow-cond { font-family: 'Barlow Condensed', sans-serif; }
      .font-barlow { font-family: 'Barlow', sans-serif; }
      ::-webkit-scrollbar { display: none; }
      * { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(style);
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem('unlockfit_has_seen_intro', 'true');
    setView('main');
  };

  const saveSettings = (key) => {
    setApiKey(key);
    localStorage.setItem('unlockfit_api_key', key);
  };

  const addHistory = (record) => {
    const newHistory = [record, ...history].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem('unlockfit_history', JSON.stringify(newHistory));
  };

  if (view === 'loading') return <div className="min-h-screen bg-[#0E0F11]" />;

  if (view === 'onboarding') {
    return (
      <div className="min-h-screen bg-[#0E0F11] text-[#F4F2EC] flex flex-col p-6 font-barlow">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
          <h1 className="font-barlow-cond font-extrabold text-5xl text-[#F4F2EC] tracking-wide">
            UNLOCKFIT
          </h1>
          <div className="space-y-4">
            <h2 className="font-barlow-cond font-extrabold text-4xl leading-tight">
              TES POMPES D'ABORD.<br/>TES RÉSEAUX ENSUITE.
            </h2>
            <p className="text-[#8B8F98] text-lg max-w-[280px] mx-auto">
              Pose ton téléphone, fais ta série, la caméra compte pour toi.
            </p>
          </div>
        </div>
        <Button onClick={completeOnboarding} className="w-full text-xl py-4 mt-auto">
          Commencer
        </Button>
      </div>
    );
  }

  if (view === 'main') {
    return (
      <div className="min-h-screen bg-[#0E0F11] text-[#F4F2EC] flex flex-col font-barlow relative">
        <header className="p-6 flex justify-between items-center z-10">
          <h1 className="font-barlow-cond font-extrabold text-2xl tracking-wide">UNLOCKFIT</h1>
          <SettingsModal apiKey={apiKey} onSave={saveSettings} />
        </header>

        <main className="flex-1 overflow-y-auto pb-24 px-6">
          {tab === 'seance' ? (
            <div className="flex flex-col items-center justify-center h-full space-y-10 pt-10">
              <div className="text-center space-y-2">
                <p className="text-[#8B8F98] uppercase tracking-widest text-sm font-semibold">Objectif</p>
                <div className="flex items-center justify-center space-x-6">
                  <button 
                    onClick={() => setGoal(Math.max(5, goal - 5))}
                    className="p-3 bg-[#1A1C20] text-[#8B8F98] active:scale-95 transition-transform"
                    style={{ borderRadius: BORDER_RADIUS }}
                  >
                    <ChevronDown size={32} />
                  </button>
                  <div className="w-32 text-center">
                    <span className="font-barlow-cond font-extrabold text-7xl text-[#B6FF3B] block leading-none">{goal}</span>
                    <span className="text-[#8B8F98] text-lg mt-1 block">pompes</span>
                  </div>
                  <button 
                    onClick={() => setGoal(Math.min(50, goal + 5))}
                    className="p-3 bg-[#1A1C20] text-[#8B8F98] active:scale-95 transition-transform"
                    style={{ borderRadius: BORDER_RADIUS }}
                  >
                    <ChevronUp size={32} />
                  </button>
                </div>
              </div>

              <div className="bg-[#1A1C20] p-5 w-full text-center" style={{ borderRadius: BORDER_RADIUS }}>
                 <AlertTriangle className="mx-auto mb-2 text-[#B6FF3B]" size={24} />
                 <p className="text-sm text-[#F4F2EC]">Unlockfit a besoin de la caméra pour compter tes pompes.</p>
                 <p className="text-xs text-[#8B8F98] mt-1">Aucune vidéo n'est enregistrée ni envoyée.</p>
              </div>

              <Button onClick={() => setView('camera')} className="w-full text-xl py-4 mt-8">
                Lancer la séance
              </Button>
            </div>
          ) : (
            <div className="pt-4">
              <h2 className="font-barlow-cond font-extrabold text-3xl mb-6">Historique</h2>
              {history.length === 0 ? (
                <p className="text-[#8B8F98] text-center mt-20">Aucune séance enregistrée.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((h, i) => (
                    <div key={i} className="bg-[#1A1C20] p-4 flex justify-between items-center" style={{ borderRadius: BORDER_RADIUS }}>
                      <div>
                        <p className="text-xs text-[#8B8F98]">{new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}</p>
                        <p className="font-barlow-cond font-extrabold text-2xl mt-1">{h.reps} / {h.goal}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-semibold ${h.score >= 80 ? 'text-[#B6FF3B]' : h.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          Score: {h.score}
                        </span>
                        <p className="text-xs text-[#8B8F98] mt-1">{h.duration.toFixed(0)}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        <div className="fixed bottom-0 left-0 right-0 bg-[#0E0F11] border-t border-[#1A1C20] flex pb-safe">
          <button 
            onClick={() => setTab('seance')}
            className={`flex-1 py-4 flex flex-col items-center justify-center transition-colors ${tab === 'seance' ? 'text-[#B6FF3B]' : 'text-[#8B8F98]'}`}
          >
            <Dumbbell size={24} className="mb-1" />
            <span className="text-xs font-semibold">Séance</span>
          </button>
          <button 
            onClick={() => setTab('historique')}
            className={`flex-1 py-4 flex flex-col items-center justify-center transition-colors ${tab === 'historique' ? 'text-[#B6FF3B]' : 'text-[#8B8F98]'}`}
          >
            <History size={24} className="mb-1" />
            <span className="text-xs font-semibold">Historique</span>
          </button>
        </div>
      </div>
    );
  }

  if (view === 'camera') {
    return (
      <CameraTracking 
        goal={goal} 
        onFinish={(data, dataUrl) => {
          setSessionData(data);
          setLastFrameDataUrl(dataUrl);
          setView('scanner');
        }}
        onCancel={() => setView('main')}
      />
    );
  }

  if (view === 'scanner') {
    return (
      <ScannerAnimation 
        frameUrl={lastFrameDataUrl}
        sessionData={sessionData}
        apiKey={apiKey}
        onComplete={(result) => {
          setEvaluationResult(result);
          addHistory({
            date: new Date().toISOString(),
            goal: sessionData.goal,
            reps: sessionData.reps,
            score: result.score,
            duration: sessionData.duration
          });
          setView('result');
        }}
        onError={() => {
           setEvaluationResult(null);
           setView('result'); 
        }}
      />
    );
  }

  if (view === 'result') {
    return (
      <ResultScreen 
        sessionData={sessionData}
        result={evaluationResult}
        onRetry={() => setView('main')}
        onRetryAPI={() => setView('scanner')}
      />
    );
  }
}

// --- SUBCOMPONENTS ---
const SettingsModal = ({ apiKey, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [val, setVal] = useState(apiKey);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="p-2 text-[#8B8F98] hover:text-[#F4F2EC]">
        <Settings size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
      <div className="bg-[#1A1C20] w-full max-w-sm p-6 space-y-6" style={{ borderRadius: BORDER_RADIUS }}>
        <h3 className="font-barlow-cond font-extrabold text-2xl text-[#F4F2EC]">Paramètres</h3>
        <div>
          <label className="block text-sm text-[#8B8F98] mb-2">Clé API Gemini (Optionnelle)</label>
          <input 
            type="text" 
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-[#0E0F11] border border-[#333] text-[#F4F2EC] p-3 focus:border-[#B6FF3B] outline-none"
            style={{ borderRadius: BORDER_RADIUS }}
          />
          <p className="text-xs text-[#8B8F98] mt-2">Laissée vide, l'app utilisera un modèle local simulé.</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" className="flex-1" onClick={() => setIsOpen(false)}>Annuler</Button>
          <Button variant="primary" className="flex-1" onClick={() => { onSave(val); setIsOpen(false); }}>Enregistrer</Button>
        </div>
      </div>
    </div>
  );
};

const CameraTracking = ({ goal, onFinish, onCancel }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef();
  const isRunningRef = useRef(false);
  
  const [status, setStatus] = useState('countdown');
  const [countdown, setCountdown] = useState(3);
  const [reps, setReps] = useState(0);
  const [warning, setWarning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const isDownRef = useRef(false);
  const repsRef = useRef(0);
  const startTimeRef = useRef(0);
  const depthLogRef = useRef([]);
  const detectorRef = useRef(null);

  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        setStatus('requesting');
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             videoRef.current.play();
             startCountdown();
          };
        }
      } catch (err) {
        console.error("Camera error", err);
        setStatus('error');
        setErrorMsg('Vérifie dans les réglages de ton appareil que la caméra est autorisée.');
      }
    };
    startCamera();

    return () => {
      isRunningRef.current = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startCountdown = () => {
    setStatus('countdown');
    let c = 3;
    setCountdown(c);
    const int = setInterval(() => {
      c--;
      if (c > 0) {
        setCountdown(c);
      } else {
        clearInterval(int);
        loadModelAndStart();
      }
    }, 1000);
  };

  const loadModelAndStart = async () => {
    setStatus('loading_model');
    try {
      if (!window.tf || !window.poseDetection) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection');
      }
      
      await window.tf.ready();
      
      const detectorConfig = { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
      detectorRef.current = await window.poseDetection.createDetector(window.poseDetection.SupportedModels.MoveNet, detectorConfig);
      
      isRunningRef.current = true;
      setStatus('ready');
      startTimeRef.current = performance.now();
      detectFrame();

    } catch (e) {
      console.error("Model load error", e);
      setStatus('error');
      setErrorMsg('Impossible de charger le modèle de détection.');
    }
  };

  const detectFrame = async () => {
    if (!videoRef.current || !detectorRef.current || !isRunningRef.current) return;
    
    if (videoRef.current.readyState < 2) {
       requestRef.current = requestAnimationFrame(detectFrame);
       return;
    }

    try {
      const poses = await detectorRef.current.estimatePoses(videoRef.current);
      
      if (poses.length > 0) {
        processPose(poses[0]);
      } else {
        setWarning('Recule un peu et mets-toi de profil, on doit te voir en entier.');
      }
    } catch (e) {
      console.error("Detection error loop", e);
    }
    
    if (isRunningRef.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
  };

  const processPose = (pose) => {
    if (!pose.keypoints) return;
    
    const kps = pose.keypoints;
    const findKp = (name) => kps.find(k => k.name === name && k.score > 0.3);

    const sL = findKp('left_shoulder');
    const eL = findKp('left_elbow');
    const wL = findKp('left_wrist');
    
    const sR = findKp('right_shoulder');
    const eR = findKp('right_elbow');
    const wR = findKp('right_wrist');

    let shoulder, elbow, wrist;

    if (sL && eL && wL && (!sR || !eR || !wR || (sL.score + eL.score + wL.score > sR.score + eR.score + wR.score))) {
       shoulder = sL; elbow = eL; wrist = wL;
    } else if (sR && eR && wR) {
       shoulder = sR; elbow = eR; wrist = wR;
    }

    if (shoulder && elbow && wrist) {
      setWarning('');
      
      const angle = getAngle(shoulder, elbow, wrist);
      
      if (angle < 90) {
        isDownRef.current = true;
        depthLogRef.current.push(angle);
      } else if (isDownRef.current && angle > 160) {
        isDownRef.current = false;
        repsRef.current += 1;
        setReps(repsRef.current);
        playBeep();
        
        if (repsRef.current >= goal) {
          endSession(true);
        }
      }
    } else {
      setWarning('Recule un peu et mets-toi de profil, on doit te voir en entier.');
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const endSession = useCallback((auto = false) => {
    isRunningRef.current = false;
    cancelAnimationFrame(requestRef.current);
    
    const finalReps = repsRef.current;
    const durationMs = performance.now() - startTimeRef.current;
    const durationSec = durationMs / 1000;
    
    if (finalReps < 3 || durationSec < 5) {
      setStatus('invalid');
      return;
    }

    const frameUrl = captureFrame();
    
    let avgDepth = 90;
    if (depthLogRef.current.length > 0) {
      avgDepth = depthLogRef.current.reduce((a,b)=>a+b,0) / depthLogRef.current.length;
    }

    onFinish({
      goal,
      reps: finalReps,
      duration: durationSec,
      avgDepth
    }, frameUrl);

  }, [goal, onFinish]);

  return (
    <div className="min-h-screen bg-[#0E0F11] flex flex-col p-4 relative overflow-hidden font-barlow">
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <XCircle size={64} className="text-red-500" />
          <p className="text-[#F4F2EC] text-lg px-4">{errorMsg}</p>
          <Button onClick={onCancel} className="w-full max-w-xs">Retour</Button>
        </div>
      )}

      {status === 'invalid' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <AlertTriangle size={64} className="text-yellow-500" />
          <p className="text-[#F4F2EC] text-lg px-4 font-semibold">On n'a pas pu compter tes pompes.</p>
          <p className="text-[#8B8F98] px-4">Place le téléphone au sol, de profil, avec ton corps entier visible, et recommence.</p>
          <Button onClick={() => window.location.reload()} className="w-full max-w-xs">Recommencer</Button>
          <button onClick={onCancel} className="text-[#8B8F98] py-4">Annuler</button>
        </div>
      )}

      {['requesting', 'countdown', 'loading_model', 'ready'].includes(status) && (
        <>
          <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center" style={{ borderRadius: BORDER_RADIUS }}>
            <canvas ref={canvasRef} className="hidden" />
            
            <video 
              ref={videoRef}
              playsInline 
              muted 
              className="absolute w-full h-full object-cover transform -scale-x-100"
            />

            {status === 'requesting' && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[#F4F2EC]">Accès caméra...</div>}
            
            {status === 'countdown' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-barlow-cond font-extrabold text-9xl text-[#B6FF3B] animate-pulse drop-shadow-2xl">{countdown}</span>
              </div>
            )}

            {status === 'loading_model' && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[#B6FF3B] font-semibold text-lg">Chargement de l'IA...</div>}

            {status === 'ready' && (
              <>
                <div className="absolute top-8 left-0 right-0 text-center drop-shadow-lg z-10">
                  <span className="font-barlow-cond font-extrabold text-8xl text-[#B6FF3B] leading-none block">{reps}</span>
                  <span className="font-barlow font-bold text-xl text-[#F4F2EC]">sur {goal}</span>
                </div>
                
                {warning && (
                  <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-[#1A1C20]/90 text-[#F4F2EC] p-4 text-center border border-yellow-500/50" style={{ borderRadius: BORDER_RADIUS }}>
                    {warning}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="pt-6 pb-2">
            <Button 
              variant="secondary" 
              onClick={() => endSession(false)} 
              className="w-full text-xl py-4 bg-red-500/20 text-red-400 border border-red-500/30"
              disabled={status !== 'ready'}
            >
              Terminer
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

const ScannerAnimation = ({ frameUrl, sessionData, apiKey, onComplete, onError }) => {
  const [textStage, setTextStage] = useState(0);
  const texts = ["Lecture de tes mouvements…", "Vérification de l'amplitude…", "Verdict…"];
  
  useEffect(() => {
    const t1 = setTimeout(() => setTextStage(1), 800);
    const t2 = setTimeout(() => setTextStage(2), 1600);
    
    const processData = async () => {
      try {
         const result = await evaluateSession(sessionData.goal, sessionData.reps, sessionData.duration, sessionData.avgDepth, apiKey);
         setTimeout(() => {
            onComplete(result);
         }, Math.max(0, 2500 - (performance.now() - startTime)));
      } catch (e) {
         setTimeout(onError, 2500);
      }
    };
    
    const startTime = performance.now();
    processData();

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="min-h-screen bg-[#0E0F11] flex flex-col p-4 relative font-barlow">
      <div className="flex-1 relative overflow-hidden bg-[#1A1C20]" style={{ borderRadius: BORDER_RADIUS }}>
        {frameUrl && (
          <img src={frameUrl} className="absolute w-full h-full object-cover transform -scale-x-100 opacity-50 grayscale" alt="frame" />
        )}
        
        <div className="absolute left-0 right-0 h-1 bg-[#B6FF3B] shadow-[0_0_20px_4px_rgba(182,255,59,0.5)] animate-[scan_2.5s_ease-in-out_infinite]" />
        
        <style>{`
          @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            50% { top: 100%; }
            90% { opacity: 1; }
            100% { top: 0%; opacity: 0; }
          }
        `}</style>
      </div>
      
      <div className="h-32 flex items-center justify-center">
        <p className="text-[#F4F2EC] text-xl animate-pulse font-semibold transition-opacity duration-300">
          {texts[textStage]}
        </p>
      </div>
    </div>
  );
};

const ResultScreen = ({ sessionData, result, onRetry, onRetryAPI }) => {
  const isError = !result;
  
  if (isError) {
    return (
      <div className="min-h-screen bg-[#0E0F11] flex flex-col items-center justify-center p-6 text-center">
         <XCircle size={64} className="text-red-500 mb-6" />
         <p className="text-[#F4F2EC] text-xl mb-8">Le verdict n'a pas pu être calculé.</p>
         <Button onClick={onRetryAPI} className="w-full max-w-xs mb-4">Réessayer</Button>
         <button onClick={onRetry} className="text-[#8B8F98]">Retour à l'accueil</button>
      </div>
    );
  }

  const success = sessionData.reps >= sessionData.goal;

  const handleShare = async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0E0F11';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#F4F2EC';
      ctx.font = 'bold 60px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('UNLOCKFIT', canvas.width / 2, 200);

      ctx.fillStyle = success ? '#B6FF3B' : '#F4F2EC';
      ctx.font = '900 180px "Barlow Condensed", sans-serif';
      ctx.fillText(result.verdict.toUpperCase(), canvas.width / 2, 600);

      ctx.fillStyle = '#F4F2EC';
      ctx.font = '900 250px "Barlow Condensed", sans-serif';
      ctx.fillText(`${sessionData.reps} / ${sessionData.goal}`, canvas.width / 2, 950);
      
      ctx.fillStyle = '#8B8F98';
      ctx.font = '600 80px "Barlow", sans-serif';
      ctx.fillText('POMPES', canvas.width / 2, 1080);

      ctx.fillStyle = '#B6FF3B';
      ctx.font = 'bold 120px "Barlow", sans-serif';
      ctx.fillText(`Score: ${result.score}/100`, canvas.width / 2, 1400);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'unlockfit-result.png', { type: 'image/png' });
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Mon score Unlockfit',
            text: 'Découvre mon résultat sur Unlockfit !'
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'unlockfit.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }, 'image/png');

    } catch (e) {
      console.error("Share error", e);
      alert("Le partage a échoué.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0F11] font-barlow flex flex-col p-6 overflow-y-auto">
      <div className="text-center mt-4">
        <p className="text-[#8B8F98] font-barlow-cond font-bold tracking-widest text-sm uppercase mb-8">Unlockfit</p>
        
        <h1 className={`font-barlow-cond font-extrabold text-7xl uppercase mb-2 ${success ? 'text-[#B6FF3B]' : 'text-[#F4F2EC]'}`}>
          {result.verdict}
        </h1>
        
        <div className="my-8">
          <span className="font-barlow-cond font-extrabold text-9xl text-[#F4F2EC] leading-none block">
            {sessionData.reps} <span className="text-5xl text-[#8B8F98]">/ {sessionData.goal}</span>
          </span>
          <span className="text-[#8B8F98] font-semibold text-xl tracking-wider uppercase block mt-2">pompes</span>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div className="bg-[#1A1C20] p-5 relative overflow-hidden" style={{ borderRadius: BORDER_RADIUS }}>
           <div className="flex justify-between items-end mb-3 relative z-10">
              <span className="text-[#F4F2EC] font-semibold">Qualité du mouvement</span>
              <span className="text-[#B6FF3B] font-barlow-cond font-bold text-3xl leading-none">{result.score}<span className="text-lg text-[#8B8F98]">/100</span></span>
           </div>
           <div className="h-3 w-full bg-[#0E0F11] rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-[#B6FF3B] transition-all duration-1000 ease-out" style={{ width: `${result.score}%` }} />
           </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
           <div className="bg-[#1A1C20] p-4 text-center flex flex-col justify-center" style={{ borderRadius: BORDER_RADIUS }}>
              <span className="text-[#8B8F98] text-xs uppercase font-semibold">Durée</span>
              <span className="text-[#F4F2EC] font-barlow-cond font-bold text-2xl mt-1">{sessionData.duration.toFixed(0)}s</span>
           </div>
           <div className="bg-[#1A1C20] p-4 text-center flex flex-col justify-center" style={{ borderRadius: BORDER_RADIUS }}>
              <span className="text-[#8B8F98] text-xs uppercase font-semibold">Rythme</span>
              <span className="text-[#F4F2EC] font-barlow-cond font-bold text-2xl mt-1">{(sessionData.duration / Math.max(1, sessionData.reps)).toFixed(1)}s/r</span>
           </div>
           <div className="bg-[#1A1C20] p-4 text-center flex flex-col justify-center" style={{ borderRadius: BORDER_RADIUS }}>
              <span className="text-[#8B8F98] text-xs uppercase font-semibold">Angle moy.</span>
              <span className="text-[#F4F2EC] font-barlow-cond font-bold text-2xl mt-1">{sessionData.avgDepth.toFixed(0)}°</span>
           </div>
        </div>

        <div className="bg-[#1A1C20] p-5 space-y-4" style={{ borderRadius: BORDER_RADIUS }}>
           <div className="flex items-start space-x-3">
              <CheckCircle2 className="text-[#B6FF3B] mt-0.5 shrink-0" size={20} />
              <p className="text-[#F4F2EC] text-sm leading-snug">{result.pointsForts}</p>
           </div>
           <div className="flex items-start space-x-3">
              <RotateCcw className="text-[#F4F2EC] mt-0.5 shrink-0 opacity-70" size={20} />
              <p className="text-[#F4F2EC] text-sm leading-snug">{result.aCorriger}</p>
           </div>
        </div>
        
        <div className="text-center py-2">
           <p className="text-[#B6FF3B] font-semibold italic">"{result.defi}"</p>
        </div>
      </div>

      <div className="mt-auto space-y-3 pb-6">
        <Button onClick={handleShare} className="w-full text-lg py-4">
           <Share2 size={20} className="mr-2" /> Partager
        </Button>
        <Button variant="secondary" onClick={onRetry} className="w-full text-lg py-4">
           Refaire une séance
        </Button>
      </div>
    </div>
  );
};
