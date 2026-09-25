"""Independent stdlib numerical oracle; no database, provider or network calls.

Normal planning equation for two independent proportions, equal allocation,
two-sided alpha .05 and .8 power, excluding the opposite rejection tail.
See https://stat.ethz.ch/R-manual/R-devel/library/stats/html/power.prop.test.html
The extra expected-count guard is planning only, not an exact binomial guarantee.
"""
from statistics import NormalDist
from math import ceil, sqrt
import json
normal = NormalDist()
pairs = [(1000,300), (5000,500), (5000,100), (100,50), (100,10), (1,1), (9998,1), (1,8000), (9980,10), (1000,1), (1,9998), (100,5000)]
out=[]
for baseline,lift in pairs:
    p,q=baseline/10000,(baseline+lift)/10000
    m=(p+q)/2
    raw=((normal.inv_cdf(.975)*sqrt(2*m*(1-m))+normal.inv_cdf(.8)*sqrt(p*(1-p)+q*(1-q)))/(lift/10000))**2
    n=ceil(raw)
    power=lambda count: normal.cdf((sqrt(count)*(lift/10000)-normal.inv_cdf(.975)*sqrt(2*m*(1-m)))/sqrt(p*(1-p)+q*(1-q)))
    assert power(n) >= .8 and power(n-1) < .8, (baseline,lift,n)
    out.append(dict(baseline=baseline,lift=lift,powerFloor=n,approximationFloor=ceil(100000/min(baseline,10000-baseline,baseline+lift,10000-baseline-lift)),powerAtFloor=power(n),powerBeforeFloor=power(n-1)))
print(json.dumps(out,indent=2))
