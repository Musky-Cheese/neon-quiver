// Quadric-error edge-collapse mesh simplifier (Garland & Heckbert), used to bring dense Meshy downloads down to game
// budgets while keeping flat panels flat and creases sharp (vertex clustering crumples them).
// usage: qem in.bin out.bin target_tris
//   in/out: uint32 nv, uint32 nt, float32 pos[nv*3], uint32 idx[nt*3]
// Collapses the cheapest edge first, places the merged vertex at the quadric optimum, refuses collapses that flip
// or sliver a face, and pins open borders with perpendicular constraint planes.
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cmath>
#include <vector>
#include <queue>
#include <algorithm>
#include <array>
using namespace std;

struct Q { double a[10] = {0}; // symmetric 4x4: a00 a01 a02 a03 a11 a12 a13 a22 a23 a33
  void plane(double x, double y, double z, double d, double w) {
    a[0] += w*x*x; a[1] += w*x*y; a[2] += w*x*z; a[3] += w*x*d; a[4] += w*y*y; a[5] += w*y*z; a[6] += w*y*d; a[7] += w*z*z; a[8] += w*z*d; a[9] += w*d*d; }
  void add(const Q& o) { for (int i = 0; i < 10; i++) a[i] += o.a[i]; }
  double err(double x, double y, double z) const {
    return a[0]*x*x + 2*a[1]*x*y + 2*a[2]*x*z + 2*a[3]*x + a[4]*y*y + 2*a[5]*y*z + 2*a[6]*y + a[7]*z*z + 2*a[8]*z + a[9]; }
};
struct V3 { double x, y, z; };
static V3 sub(V3 a, V3 b) { return {a.x-b.x, a.y-b.y, a.z-b.z}; }
static V3 cross(V3 a, V3 b) { return {a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x}; }
static double dot(V3 a, V3 b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
static double len(V3 a) { return sqrt(dot(a, a)); }

vector<V3> P; vector<Q> Qv; vector<array<int,3>> F; vector<char> fdead; vector<vector<int>> vf; vector<int> ver; vector<char> vdead;
struct E { double c; int a, b, va, vb; V3 p; bool operator<(const E& o) const { return c > o.c; } };

static bool solve(const Q& q, V3& out) {
  double m[3][4] = {{q.a[0], q.a[1], q.a[2], -q.a[3]}, {q.a[1], q.a[4], q.a[5], -q.a[6]}, {q.a[2], q.a[5], q.a[7], -q.a[8]}};
  double det = m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  double sc = fabs(q.a[0]) + fabs(q.a[4]) + fabs(q.a[7]); if (fabs(det) < 1e-12 * sc * sc * sc + 1e-30) return false;
  auto d3 = [&](int c) { double r[3][3]; for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) r[i][j] = (j == c) ? m[i][3] : m[i][j];
    return r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1]) - r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0]) + r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]); };
  out = {d3(0)/det, d3(1)/det, d3(2)/det}; return true;
}
static E make(int a, int b) {
  Q q = Qv[a]; q.add(Qv[b]); E e; e.a = a; e.b = b; e.va = ver[a]; e.vb = ver[b];
  V3 p; V3 mid = {(P[a].x+P[b].x)/2, (P[a].y+P[b].y)/2, (P[a].z+P[b].z)/2};
  double el = len(sub(P[a], P[b]));
  if (!solve(q, p) || len(sub(p, mid)) > el * 2) {   // degenerate or runaway optimum: best of the ends and middle
    double ea = q.err(P[a].x, P[a].y, P[a].z), eb = q.err(P[b].x, P[b].y, P[b].z), em = q.err(mid.x, mid.y, mid.z);
    p = ea < eb ? (ea < em ? P[a] : mid) : (eb < em ? P[b] : mid); }
  e.p = p; e.c = max(0.0, q.err(p.x, p.y, p.z)); return e;
}
// would moving v (collapsing into the new spot) flip or crush any face around v that survives the collapse?
static bool bad(int v, int other, V3 p) {
  for (int f : vf[v]) { if (fdead[f]) continue; auto& t = F[f]; if (t[0] == other || t[1] == other || t[2] == other) continue;
    int k = t[0] == v ? 0 : t[1] == v ? 1 : 2; V3 a = P[t[(k+1)%3]], b = P[t[(k+2)%3]];
    V3 n0 = cross(sub(a, P[v]), sub(b, P[v])), n1 = cross(sub(a, p), sub(b, p));
    double l0 = len(n0), l1 = len(n1); if (l1 < 1e-14) return true;
    if (dot(n0, n1) < 0.2 * l0 * l1) return true;                       // flips or turns more than ~78 degrees
    double e1 = len(sub(a, p)), e2 = len(sub(b, p)), e3 = len(sub(a, b)); double mx = max(e1, max(e2, e3));
    if (l1 / (mx * mx) < 0.02) return true;                              // sliver
  }
  return false;
}
int main(int argc, char** argv) {
  FILE* f = fopen(argv[1], "rb"); uint32_t nv, nt; fread(&nv, 4, 1, f); fread(&nt, 4, 1, f);
  vector<float> pf(nv*3); vector<uint32_t> id(nt*3); fread(pf.data(), 4, nv*3, f); fread(id.data(), 4, nt*3, f); fclose(f);
  long target = atol(argv[3]);
  P.resize(nv); for (uint32_t i = 0; i < nv; i++) P[i] = {pf[i*3], pf[i*3+1], pf[i*3+2]};
  Qv.resize(nv); vf.resize(nv); ver.assign(nv, 0); vdead.assign(nv, 0);
  for (uint32_t t = 0; t < nt; t++) { int a = id[t*3], b = id[t*3+1], c = id[t*3+2]; if (a == b || b == c || a == c) continue;
    F.push_back({a, b, c}); }
  fdead.assign(F.size(), 0);
  vector<pair<long long,int>> edges;   // (key, face) for border detection
  for (size_t t = 0; t < F.size(); t++) { auto& tr = F[t]; V3 n = cross(sub(P[tr[1]], P[tr[0]]), sub(P[tr[2]], P[tr[0]])); double l = len(n);
    for (int k = 0; k < 3; k++) vf[tr[k]].push_back(t);
    if (l < 1e-20) continue; V3 u = {n.x/l, n.y/l, n.z/l}; double d = -dot(u, P[tr[0]]);
    for (int k = 0; k < 3; k++) Qv[tr[k]].plane(u.x, u.y, u.z, d, l * 0.5);
    for (int k = 0; k < 3; k++) { long long a = tr[k], b = tr[(k+1)%3]; edges.push_back({min(a,b) * 4000000LL + max(a,b), (int)t}); } }
  sort(edges.begin(), edges.end());
  priority_queue<E> h;
  for (size_t i = 0; i < edges.size(); i++) {
    bool first = i == 0 || edges[i].first != edges[i-1].first; if (!first) continue;
    bool border = (i + 1 == edges.size() || edges[i+1].first != edges[i].first);
    int a = edges[i].first / 4000000LL, b = edges[i].first % 4000000LL;
    if (border) {   // pin open edges: a plane through the edge, perpendicular to its face
      auto& tr = F[edges[i].second]; V3 n = cross(sub(P[tr[1]], P[tr[0]]), sub(P[tr[2]], P[tr[0]])); V3 ed = sub(P[b], P[a]);
      V3 pn = cross(ed, n); double l = len(pn); if (l > 1e-20) { pn = {pn.x/l, pn.y/l, pn.z/l}; double d = -dot(pn, P[a]); double w = dot(ed, ed) * 20;
        Qv[a].plane(pn.x, pn.y, pn.z, d, w); Qv[b].plane(pn.x, pn.y, pn.z, d, w); } }
  }
  for (size_t i = 0; i < edges.size(); i++) if (i == 0 || edges[i].first != edges[i-1].first) h.push(make(edges[i].first / 4000000LL, edges[i].first % 4000000LL));
  long alive = F.size(); vector<int> nbr;
  while (alive > target && !h.empty()) {
    E e = h.top(); h.pop();
    if (vdead[e.a] || vdead[e.b] || ver[e.a] != e.va || ver[e.b] != e.vb) continue;
    if (bad(e.a, e.b, e.p) || bad(e.b, e.a, e.p)) { continue; }
    // link condition (manifold safety): the two ends may share only the vertices of their common faces
    nbr.clear(); int shared = 0, common = 0;
    for (int fi : vf[e.a]) if (!fdead[fi]) for (int k = 0; k < 3; k++) nbr.push_back(F[fi][k]);
    sort(nbr.begin(), nbr.end()); nbr.erase(unique(nbr.begin(), nbr.end()), nbr.end());
    for (int fi : vf[e.b]) if (!fdead[fi]) { auto& t = F[fi]; if (t[0] == e.a || t[1] == e.a || t[2] == e.a) common++; }
    { vector<int> nb2; for (int fi : vf[e.b]) if (!fdead[fi]) for (int k = 0; k < 3; k++) nb2.push_back(F[fi][k]);
      sort(nb2.begin(), nb2.end()); nb2.erase(unique(nb2.begin(), nb2.end()), nb2.end());
      for (int v : nb2) if (v != e.a && v != e.b && binary_search(nbr.begin(), nbr.end(), v)) shared++; }
    if (shared > common) continue;
    // collapse b into a
    P[e.a] = e.p; Qv[e.a].add(Qv[e.b]); vdead[e.b] = 1; ver[e.a]++;
    for (int fi : vf[e.b]) { if (fdead[fi]) continue; auto& t = F[fi];
      if (t[0] == e.a || t[1] == e.a || t[2] == e.a) { fdead[fi] = 1; alive--; continue; }
      for (int k = 0; k < 3; k++) if (t[k] == e.b) t[k] = e.a; vf[e.a].push_back(fi); }
    { vector<int> keep; for (int fi : vf[e.a]) if (!fdead[fi]) keep.push_back(fi); sort(keep.begin(), keep.end()); keep.erase(unique(keep.begin(), keep.end()), keep.end()); vf[e.a] = keep; }
    nbr.clear(); for (int fi : vf[e.a]) for (int k = 0; k < 3; k++) if (F[fi][k] != e.a) nbr.push_back(F[fi][k]);
    sort(nbr.begin(), nbr.end()); nbr.erase(unique(nbr.begin(), nbr.end()), nbr.end());
    for (int v : nbr) { ver[v]++; }
    for (int v : nbr) h.push(make(e.a, v));
    for (int v : nbr) { // neighbours' other edges changed version too: requeue them
      for (int fi : vf[v]) { if (fdead[fi]) continue; for (int k = 0; k < 3; k++) { int w = F[fi][k]; if (w != v && w != e.a && w > v) h.push(make(v, w)); } } }
  }
  // compact
  vector<int> remap(nv, -1); vector<float> op; vector<uint32_t> oi; int n = 0;
  for (size_t t = 0; t < F.size(); t++) { if (fdead[t]) continue; for (int k = 0; k < 3; k++) { int v = F[t][k];
      if (remap[v] < 0) { remap[v] = n++; op.push_back(P[v].x); op.push_back(P[v].y); op.push_back(P[v].z); } oi.push_back(remap[v]); } }
  uint32_t onv = n, ont = oi.size() / 3; FILE* g = fopen(argv[2], "wb"); fwrite(&onv, 4, 1, g); fwrite(&ont, 4, 1, g);
  fwrite(op.data(), 4, op.size(), g); fwrite(oi.data(), 4, oi.size(), g); fclose(g);
  fprintf(stderr, "%u -> %u tris, %u verts\n", nt, ont, onv); return 0;
}
