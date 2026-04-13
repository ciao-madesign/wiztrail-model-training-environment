window.MODEL = {
  kT: 0.35,
  techWeights: { frip: 0.45, slopeVar: 0.35, roughness: 0.20, vert: 0.30 },
  normalization: { frip: 0.60, slopeVar: 0.55, roughness: 0.35, vert: 150 }
};

window.Engine = {
  compute(metrics) {

    const normFRIP = metrics.frip / MODEL.normalization.frip;
    const normSVar = metrics.slopeVar / MODEL.normalization.slopeVar;
    const normRough = metrics.roughness / MODEL.normalization.roughness;
    const vertInt = (metrics.gain / metrics.km) / MODEL.normalization.vert;

    const tech =
      (normFRIP * MODEL.techWeights.frip +
       normSVar * MODEL.techWeights.slopeVar +
       normRough * MODEL.techWeights.roughness) * 0.7 +
      vertInt * MODEL.techWeights.vert;

    const WDI = (metrics.gain/1000 + tech * MODEL.kT);

    return { WDI, tech };
  }
};