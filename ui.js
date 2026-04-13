let step = 0;
let currentMetrics = null;
let currentPred = null;

function nextStep(){
  document.querySelectorAll('.step')[step].classList.remove('active');
  step++;
  document.querySelectorAll('.step')[step].classList.add('active');
}

/* ===============================
   PARSER REALE (INTEGRATO)
================================= */
async function parseGPX(file){

  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");

  const pts = GPXParser.parseTrack(xml);
  const { d, e, km, gain } = GPXParser.compute(pts);

  /* ---- CALCOLI IDENTICI AL TUO ENGINE ---- */

  function computeSlopes(d, e){
    const slopes = [];
    for (let i = 1; i < d.length; i++) {
      const dd = d[i] - d[i - 1];
      if (dd > 0) slopes.push((e[i] - e[i - 1]) / dd);
    }
    return slopes;
  }

  function computeFRIP(d, e){
    let maxSlope = 0;
    for (let i = 0; i < d.length; i++) {
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
    for (let i = 1; i < slopes.length; i++) {
      sum += Math.abs(slopes[i] - slopes[i - 1]);
    }
    return sum / slopes.length;
  }

  const slopes = computeSlopes(d, e);

  return {
    frip: computeFRIP(d, e),
    slopeVar: computeSlopeVar(slopes),
    roughness: computeRoughness(slopes),
    gain,
    km
  };
}

/* ===============================
   ANALISI
================================= */
async function analyzeGPX(){

  const file = document.getElementById('gpxFile').files[0];
  if (!file) return;

  currentMetrics = await parseGPX(file);
  currentPred = Engine.compute(currentMetrics);

  document.getElementById('metricsBox').innerHTML = `
    FRIP: ${currentMetrics.frip.toFixed(3)} → pendenze locali<br>
    SlopeVar: ${currentMetrics.slopeVar.toFixed(3)} → variabilità<br>
    Roughness: ${currentMetrics.roughness.toFixed(3)} → irregolarità<br>
    D+: ${currentMetrics.gain.toFixed(0)} m<br>
    Distanza: ${currentMetrics.km.toFixed(1)} km
  `;

  document.getElementById('outputBox').innerHTML = `
    TechScore: <b>${currentPred.tech.toFixed(2)}</b><br>
    WDI: <b>${currentPred.WDI.toFixed(2)}</b>
  `;

  document.getElementById('predTech').textContent =
    currentPred.tech.toFixed(2);

  nextStep();
}

/* ===============================
   TRAINING
================================= */
function train(){

  const feedback = {
    tech: parseFloat(document.getElementById('tech').value),
    salita: parseFloat(document.getElementById('salita').value),
    discesa: parseFloat(document.getElementById('discesa').value),
    confidence: parseFloat(document.getElementById('confidence').value)
  };

  dataset.push({
    pred: currentPred,
    feedback,
    metrics: currentMetrics
  });

  autoCalibrate();

  document.getElementById('trainOutput').innerHTML = `
    ✔ Modello aggiornato<br>
    Versione: ${history.length}<br>
    Dataset: ${dataset.length}
  `;

  drawChart();
}

/* ===============================
   GRAFICO ERRORE (MIGLIORATO)
================================= */
function drawChart(){

  const ctx = document.getElementById('chart').getContext('2d');
  ctx.clearRect(0,0,600,200);

  ctx.beginPath();

  history.forEach((h,i)=>{
    const error = h.error || 0.5;
    ctx.lineTo(i*40, 200 - error*150);
  });

  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ===============================
   EXPORT / IMPORT
================================= */
function exportModel(){
  const blob = new Blob([JSON.stringify(MODEL)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "model.json";
  a.click();
}

function importModel(){
  const input = document.createElement('input');
  input.type = "file";
  input.onchange = e => {
    const reader = new FileReader();
    reader.onload = () => MODEL = JSON.parse(reader.result);
    reader.readAsText(e.target.files[0]);
  };
  input.click();
}