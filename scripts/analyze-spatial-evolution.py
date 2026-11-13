"""Describe saved simulation observations; no simulation interventions or RNG use."""
import json
import math
import random
import sys
from pathlib import Path

folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'reports/spatial-evolution-2026-11-13')
keys = ['tolerance', 'proliferation', 'invasion', 'antigenLevel']
summary = []
for path in sorted(folder.glob('*.json')):
    data = json.loads(path.read_text())
    if 'runs' not in data or 'config' not in data:
        continue
    for run in data['runs']:
        end = run['samples'][-1]
        cells = end['cells']
        n = len(cells)
        width, height = data['config']['worldWidth'], data['config']['worldHeight']
        # A fixed 24-model-unit neighborhood, including periodic boundaries.
        edges = []
        for i, a in enumerate(cells):
            for j, b in enumerate(cells[:i]):
                dx, dy = abs(a['x']-b['x']), abs(a['y']-b['y'])
                dx, dy = min(dx, width-dx), min(dy, height-dy)
                if dx*dx + dy*dy <= 24**2:
                    edges.append((i, j))
        ordered = sorted(cells, key=lambda c: (c['adversity'], c['birth']))
        quartile = n//4 if n >= 8 and ordered[-1]['adversity']-ordered[0]['adversity'] > .02 else 0
        stats = {}
        for key in keys:
            values = [c[key] for c in cells]
            avg = sum(values)/n if n else None
            centered = [v-avg for v in values]
            variance = sum(v*v for v in centered)
            def moran(z):
                return n*sum(z[i]*z[j] for i, j in edges)/(len(edges)*variance) if variance and edges else None
            observed = moran(centered)
            null = []
            # Observer-local, deterministic stream; never touches model state.
            rng = random.Random(91731)
            if observed is not None:
                for _ in range(99):
                    shuffled = centered[:]
                    rng.shuffle(shuffled)
                    null.append(moran(shuffled))
            stats[key] = dict(mean=avg, minimum=min(values) if n else None, maximum=max(values) if n else None,
                lowPressureMean=sum(c[key] for c in ordered[:quartile])/quartile if quartile else None,
                highPressureMean=sum(c[key] for c in ordered[-quartile:])/quartile if quartile else None,
                moranI=observed, shuffledMean=sum(null)/len(null) if null else None,
                shuffled95=sorted(null)[94] if null else None)
        founders = [e for e in run['events'] if e['type'] == 'malignant']
        inherited_keys = ['tolerance', 'proliferation', 'invasion', 'repair']
        founder_vectors = {tuple(e['genome'].get(k, 1) for k in inherited_keys) for e in founders}
        evolved = sum(tuple(c[k] for k in inherited_keys) not in founder_vectors for c in cells)
        summary.append(dict(file=path.name, seed=run['seed'], time=end['time'], livingTumor=n,
            malignantFounders=len(founders), tumorDivisions=end['tumorDivisions'], livingGeneticClones=end['clones'],
            livingAntigenBranches=end['antigenBranches'], kills=end['counters']['kills'],
            maxGeneration=max((c['generation'] for c in cells), default=0),
            livingWithTraitsAbsentFromAllFounders=evolved, neighborhoodEdges=len(edges), quartileSize=quartile,
            integrity=run['integrity'], traits=stats))
output = {'neighborhoodRadius':24, 'permutations':99,
          'interpretation':'Descriptive spatial autocorrelation, not causal selection evidence or clinical validation. Null shuffles retain the same positions and value distribution. Environmental quartiles are not geometric core/rim labels.',
          'runs':summary}
(folder/'spatial-summary.json').write_text(json.dumps(output, indent=2)+'\n')
for r in summary:
    print(r['file'], r['seed'], r['livingTumor'], r['tumorDivisions'], r['livingWithTraitsAbsentFromAllFounders'],
          {k:round(v['moranI'],3) if v['moranI'] is not None else None for k,v in r['traits'].items()})
