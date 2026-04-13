/* ===============================
   STATE
================================= */
let step = 0;
let dataset = [];
let history = [];

let currentMetrics = null;
let currentPred = null;

const LR = 0.05;

/* ===============================
   STEP UI
================================= */
function nextStep(){
  const steps = document.querySelectorAll('.step');
  steps[step].classList.remove('active');
  step = Math.min(step + 1, steps.length - 1);
  steps[step].classList.add('active');
}

function resetSteps(){
  step = 0;
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.step')[0].classList.add('active');
}

/* ===============================
   ANALISI GPX (USA TUO PARSER)
================================= */
async function analyzeGPX(){

  const file = document.getElementById('gpxFile').files[0];

  if (!file){
    debug("Seleziona un file GPX");
    return;
  }

  try {

    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");

    const pts = GPXParser.parseTrack(xml);

    if (!pts || pts.length < 10){
      debug("GPX non valido o troppo corto");
      return;
    }

    const { d, e, km, gain } = GPXParser.compute(pts);

    /* ===== feature extraction coerente con engine ===== */

    function computeSlopes(d, e){
      const slopes = [];
      for (let i = 1; i < d.length; i++){
        const dd = d[i] - d[i-1];
        if (dd > 0) slopes.push((e[i] - e[i-1]) / dd);
      }
      return slopes;
    }

    function computeFRIP(d, e){
      let maxSlope = 0;
      for (let i = 0; i < d.length; i++){
        let j = i;
        while (j < d.length && d[j] < d[i] + 40) j++;
        if (j >= d.length) break;
        const slope = Math.abs((e[j] - e[i]) / (d[j] - d[i]));
        if (slope > maxSlope) maxSlope = slope;
      }
      return maxSlope;
    }

    function computeSlopeVar(slopes){
      if (!slopes.length) return 0;
      const abs = slopes.map(Math.abs);
      const mean = abs.reduce((s,v)=>s+v,0)/abs.length;
      const variance = slopes.reduce((s,v)=>s+(v-mean)**2,0)/slopes.length;
      return Math.sqrt(variance)/(1+mean);
    }

    function computeRoughness(slopes){
      if (slopes.length < 2) return 0;
      let sum = 0;
      for (let i=1;i<slopes.length;i++){
        sum += Math.abs(slopes[i]-slopes[i-1]);
      }
      return sum / slopes.length;
    }

    const slopes = computeSlopes(d, e);

    currentMetrics = {
      frip: computeFRIP(d, e),
      slopeVar: computeSlopeVar(slopes),
      roughness: computeRoughness(slopes),
      gain,
      km
    };

    currentPred = Engine.compute(currentMetrics);

    /* ===== UI ===== */

    document.getElementById('metricsBox').innerHTML = `
      <b>FRIP</b>: ${currentMetrics.frip.toFixed(3)} → pendenza massima<br>
      <b>SlopeVar</b>: ${currentMetrics.slopeVar.toFixed(3)} → variabilità<br>
      <b>Roughness</b>: ${currentMetrics.roughness.toFixed(3)} → irregolarità<br>
      <b>Dislivello</b>: ${gain.toFixed(0)} m<br>
      <b>Distanza</b>: ${km.toFixed(1)} km
    `;

    document.getElementById('outputBox').innerHTML = `
      <b>TechScore</b>: ${currentPred.tech.toFixed(2)}<br>
      <b>WDI</b>: ${currentPred.WDI.toFixed(2)}
    `;

    debug("Analisi completata");

    nextStep();

  } catch(e){
    console.error(e);
    debug("Errore durante analisi GPX");
  }
}

/* ===============================
   TRAINING
================================= */
function train(){

  const feedback = {
    tech: parseFloat(document.getElementById('tech').value),
    confidence: parseFloat(document.getElementById('confidence').value)
  };

  dataset.push({
    pred: currentPred,
    feedback,
    metrics: currentMetrics
  });

  autoCalibrate();

  document.getElementById('trainOutput').innerHTML = `
    ✔ Training eseguito<br>
    Dataset: ${dataset.length}<br>
    Versioni: ${history.length}
  `;

  drawChart();
  updateDebug();

  nextStep();
}

/* ===============================
   AUTO CALIBRATION (REALE)
================================= */
function autoCalibrate(){

  if (dataset.length < 3) return;

  let totalError = 0;

  dataset.forEach(d => {

    if (d.feedback.tech === null) return;

    const target = d.feedback.tech / 100 * 2;
    const pred = d.pred.tech;

    const error = (target - pred) * d.feedback.confidence;

    totalError += Math.abs(error);

    MODEL.techWeights.frip      += LR * error * d.metrics.frip;
    MODEL.techWeights.slopeVar  += LR * error * d.metrics.slopeVar;
    MODEL.techWeights.roughness += LR * error * d.metrics.roughness;
  });

  /* normalizzazione */
  let w = MODEL.techWeights;
  let sum = w.frip + w.slopeVar + w.roughness;

  if (sum > 0){
    w.frip      /= sum;
    w.slopeVar  /= sum;
    w.roughness /= sum;
  }

  history.push({
    error: totalError / dataset.length
  });
}

/* ===============================
   DEBUG MODELLO
================================= */
function updateDebug(){

  const w = MODEL.techWeights;

  document.getElementById('modelDebug').innerHTML = `
    <b>Pesi modello:</b><br>
    FRIP: ${w.frip.toFixed(3)}<br>
    SlopeVar: ${w.slopeVar.toFixed(3)}<br>
    Roughness: ${w.roughness.toFixed(3)}<br>
    kT: ${MODEL.kT.toFixed(3)}<br><br>

    <b>Errore medio:</b><br>
    ${(history[history.length-1]?.error || 0).toFixed(3)}
  `;
}

/* ===============================
   GRAFICO ERRORE
================================= */
function drawChart(){

  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.beginPath();

  history.forEach((h,i)=>{
    const x = i * 40;
    const y = canvas.height - h.error * 150;
    if (i === 0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });

  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ===============================
   UTILS
================================= */
function debug(msg){
  document.getElementById('debug').innerText = msg;
}

/* ===============================
   EXPORT / IMPORT
================================= */
function exportModel(){
  const blob = new Blob([JSON.stringify(MODEL)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "wiztrail-model.json";
  a.click();
}

function importModel(){
  const input = document.createElement('input');
  input.type = "file";

  input.onchange = e => {
    const reader = new FileReader();
    reader.onload = () => {
      MODEL = JSON.parse(reader.result);
      updateDebug();
    };
    reader.readAsText(e.target.files[0]);
  };

  input.click();
}