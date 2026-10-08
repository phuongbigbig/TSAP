// Regression tests for the stats engine. Run: NODE_PATH=$(npm root -g) node tests/test_stats.js
const { chromium } = require('playwright');
const path = require('path');
let fails = 0;
function ok(cond, name, extra) { if (cond) console.log('PASS', name); else { fails++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const ev = (f, a) => page.evaluate(f, a);

  // 1. perfect fit / zero variance
  let r = await ev(() => ({ perfect: linreg([0,1,2,3,4],[1,3,5,7,9]), flat: linreg([0,1,2,3],[5,5,5,5]), noisy: linreg([0,1,2,3,4],[1,3,2,5,4]),
    w: welch([1,1,1],[2,2,2]), w0: welch([1,1,1],[1,1,1]), an: anova([[1,1,1],[2,2,2]]), an0: anova([[1,1,1],[1,1,1]]) }));
  ok(r.perfect.p === 0 && r.perfect.r2 === 1, 'linreg perfect fit -> p=0', r.perfect);
  ok(r.flat.p === 1, 'linreg constant y -> p=1', r.flat);
  ok(r.noisy.p > 0.01 && r.noisy.p < 0.2, 'linreg noisy p sane', r.noisy);
  ok(r.w.p === 0 && r.w0.p === 1, 'welch zero variance', [r.w, r.w0]);
  ok(r.an.p === 0 && r.an0.p === 1, 'anova zero within-variance', [r.an.p, r.an0.p]);

  // 2. p-value / critical value accuracy
  r = await ev(() => ({ t: invT(0.05, 4), f: fDistP(4, 2, 12), tp: tDistP(2.776445, 4) }));
  ok(near(r.t, 2.7764451, 1e-6) && near(r.f, 0.046656, 1e-6) && near(r.tp, 0.05, 1e-4), 'distribution functions', r);

  // 3. two-way ANOVA: unbalanced Type III vs numpy reference
  r = await ev(() => twoWayANOVA([[[1,2,3,4],[10]],[[5],[6,7,8,9,10,11]]], 2, 2));
  ok(near(r.time.F, 0.147126, 1e-4) && near(r.series.F, 17.802299, 1e-4) && near(r.inter.F, 2.354023, 1e-4) && r.error.df === 8 && r.unbalanced,
     'two-way ANOVA Type III (unbalanced)', r);
  // balanced: matches classical formulas
  r = await ev(() => { const c = [[[1,2],[3,5]],[[2,4],[8,9]],[[3,3],[9,12]]]; const a = twoWayANOVA(c, 3, 2);
    let all = [].concat(...c.map(row => [].concat(...row))), g = mean(all), ssT = 0, ssS = 0, ssC = 0;
    c.forEach(row => { const m = mean([].concat(...row)); ssT += 4 * (m - g) ** 2; });
    for (let s = 0; s < 2; s++) { const m = mean([].concat(...c.map(row => row[s]))); ssS += 6 * (m - g) ** 2; }
    c.forEach(row => row.forEach(cell => { ssC += 2 * (mean(cell) - g) ** 2; }));
    return { a, ssT, ssS, ssI: ssC - ssT - ssS }; });
  ok(near(r.a.time.ss, r.ssT) && near(r.a.series.ss, r.ssS) && near(r.a.inter.ss, r.ssI) && !r.a.unbalanced, 'two-way ANOVA balanced == classical', r);
  r = await ev(() => twoWayANOVA([[[1,2],[]],[[2,4],[8,9]]], 2, 2));
  ok(r && r.emptyCells && r.error.df === 3, 'two-way ANOVA with empty cell does not crash', r);

  // 4. data parsing: duplicates, blanks, bad cells, replicate identity
  r = await ev(() => { tpoints = ['0','10','10.0','abc','','20']; series = ['A']; nRep = 3;
    data = [[['1','2','3']],[['4','','6']],[['5','7','']],[['9','9','9']],[['8','8','8']],[['7','x','9']]]; const S = computeSeries(); return { pts: S[0].pts, warn: parseWarn }; });
  ok(r.pts.length === 3 && r.pts[1].t === 10 && r.pts[1].n === 4 && r.warn.dupTimes === 1, 'duplicate times pooled', r.pts);
  ok(r.warn.badVals === 1 && r.warn.badTimes === 2, 'bad values and rows with non-numeric/blank time are reported and skipped', r.warn);
  ok(r.pts.length === 3 && !r.pts.some(p => p.t === 0 && p.reps.includes(8)), 'blank time not treated as t=0');
  r = await ev(() => { tpoints = ['0','1','2']; series = ['A','B']; nRep = 3; document.getElementById('analysisSel').value = 'auc';
    // replicate 2 is blank at t=1 in A: reps must stay aligned by column
    data = [[['1','10','100'],['1','1','1']],[['1','','100'],['1','1','1']],[['1','10','100'],['1','1','1']]];
    const S = computeSeries(); const R = runAnalysis(S); return { idx: S[0].pts[1].idx, perRepA: R.rows[0].perRep, perRepB: R.rows[1].perRep }; });
  ok(JSON.stringify(r.idx) === '[0,2]' && JSON.stringify(r.perRepA) === '[2,200]', 'AUC keeps replicate identity & drops incomplete curves', r);
  ok(JSON.stringify(r.perRepB) === '[2,2,2]', 'AUC complete replicates all used', r);

  // 5. per-timepoint correction: untestable timepoint must not inflate the family
  r = await ev(() => { tpoints = ['0','1','2']; series = ['A','B','C']; nRep = 3; document.getElementById('analysisSel').value = 'timepoint';
    document.getElementById('tpTestSel').value = 'anova'; document.getElementById('tpAdjSel').value = 'bonferroni';
    data = [[['1','2','3'],['4','5','6'],['7','8','9']],[['1','',''],['2','',''],['3','','']],[['1','2','1.5'],['1.1','2.1','1.6'],['0.9','1.9','1.4']]];
    const R = runAnalysis(computeSeries()); return R.rows.map(x => ({ praw: x.praw, padj: x.padj })); });
  ok(near(r[0].padj, Math.min(1, r[0].praw * 2)) && isNaN(r[1].praw) && r[1].padj == null, 'Bonferroni family excludes untestable timepoints', r);

  // 6. repeated-measures ANOVA + Greenhouse-Geisser
  r = await ev(() => { const mk = (b) => [0,1,2,3].map(k => b + 2 * k + (b % 3 - 1) * (k % 2)); 
    const rm = { T: 4, times: [0,1,2,3], series: [{ name: 'A', subjects: [mk(1), mk(2), mk(3), mk(4)], dropped: 0 }, { name: 'B', subjects: [mk(2).map(v => v * 1.5), mk(3).map(v => v * 1.5), mk(5).map(v => v * 1.5)], dropped: 0 }] };
    return rmANOVA(rm); });
  ok(r.eps >= 1 / 3 - 1e-9 && r.eps <= 1 && r.time.pGG >= r.time.p - 1e-12 && r.balanced === false, 'RM ANOVA: GG epsilon in range, pGG >= p, unbalanced flagged', { eps: r.eps, p: r.time.p, pGG: r.time.pGG });
  r = await ev(() => { const v = [[2,-1,-1],[-1,2,-1],[-1,-1,2]], sh = [0,1,-1]; // exactly spherical deviations
    const subj = v.map((d, i) => d.map(x => 10 + sh[i] + x)); return rmANOVA({ T: 3, times: [0,1,2], series: [{ name: 'A', subjects: subj, dropped: 0 }] }); });
  ok(Math.abs(r.eps - 1) < 1e-9, 'RM ANOVA: epsilon=1 under sphericity', r.eps);
  r = await ev(() => { const subj = [[0,0,0],[0,0,3],[0,0,-3],[1,1,1],[-1,-1,-1]]; return rmANOVA({ T: 3, times: [0,1,2], series: [{ name: 'A', subjects: subj, dropped: 0 }] }); });
  ok(r.eps < 0.6, 'RM ANOVA: epsilon drops when one timepoint carries all the variance', r.eps);
  r = await ev(() => rmTrend({ times: [0,1,2], T: 3, series: [{ name: 'A', subjects: [[1,2,3],[2,3,4],[0,1,2]], dropped: 0 }] }).rows[0]);
  ok(r.p === 0, 'rmTrend identical slopes -> p=0', r);

  // 7. export / import hardening
  r = await ev(() => ({ a: csvCell('=HYPERLINK("x")'), b: csvCell('-1.5'), c: csvCell('normal'), d: csvCell(-3), e: xmlEsc('a\u0001b<') }));
  ok(r.a.indexOf("'=") >= 0 && r.b === '-1.5' && r.c === 'normal' && r.d === '-3' && r.e === 'ab&lt;', 'CSV formula injection / XML control chars', r);
  r = await ev(() => { importData(parseDelimited("time,series,value,replicate\n0,A,1,r1\n0,A,2,r2\n10.0,A,3,r1\n10,A,4,r2\n", ','), 't.csv'); return { t: tpoints, rep: repeated, nrep: nRep, d: data }; });
  ok(r.t.length === 2 && r.rep === false, "import: '10' and '10.0' merge; 'replicate' column does not enable RM mode", r);
  r = await ev(() => { importData(parseDelimited("time,series,value,subject\n0,A,1,s1\n0,A,2,s2\n1,A,3,s1\n1,A,4,s2\n", ','), 't.csv'); return repeated; });
  ok(r === true, "import: 'subject' column enables RM mode");

  // 8. full UI run on every analysis/chart should not throw (including degenerate data)
  r = await ev(() => { const out = []; ['trend','timepoint','auc','twoway','acf','corr'].forEach(an => ['line','area','heatmap','facet'].forEach(ch => {
    try { loadExample('few'); repeated = false; document.getElementById('analysisSel').value = an; cfg.chart = ch; update(); loadExample('dense'); update(); tpoints = ['5']; series=['A']; nRep=1; data=[[['1']]]; update(); }
    catch (e) { out.push(an + '/' + ch + ': ' + e); } })); return out; });
  ok(r.length === 0, 'no exceptions across analyses × charts incl. degenerate data', r);
  ok(errs.length === 0, 'no page errors', errs);

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
