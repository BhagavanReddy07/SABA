# SABA Bench results

Run 2026-10-12 against http://localhost:3100 · 12 probes per configuration.

| Configuration | Overall | Recall | Cross | Update | Temporal | Moment | Abstain | Median reply time |
|---|---|---|---|---|---|---|---|---|
| No memory | **17%** | 0% | 50% | 0% | 0% | 0% | 100% | 1.0 s |
| T1 working only | **17%** | 0% | 50% | 0% | 0% | 0% | 100% | 1.2 s |
| T1 + T2 facts | **75%** | 100% | 100% | 100% | 0% | 0% | 100% | 1.1 s |
| T1 + T2 + T3 semantic (SABA) | **100%** | 100% | 100% | 100% | 100% | 100% | 100% | 1.8 s |

Facts stored after planting: 11 · grounded in what the user said: 100% (heuristic).
