// ============================================================
//  SortViz — main.cpp
//
//  What the C++ is doing that JavaScript cannot:
//
//  1. /sort      — Records every comparison & swap as frames.
//                  Same logic as before, now well-structured.
//
//  2. /race      — Runs all 6 algorithms simultaneously using
//                  std::async on real OS threads. Each thread
//                  sorts independently. JS is single-threaded
//                  and cannot do this.
//
//  3. /benchmark — Sorts arrays of 1k, 5k, 10k, 50k, 100k,
//                  500k, 1M elements and records actual CPU
//                  wall-clock time using
//                  std::chrono::high_resolution_clock with
//                  nanosecond precision. JS's performance.now()
//                  is throttled by browsers for security and
//                  cannot give this accuracy.
//
//  Build:  g++ -o server main.cpp -std=c++17 -pthread -O2
//  Run:    ./server
// ============================================================
#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include "httplib.h"
#include "json.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <future>
#include <iostream>
#include <numeric>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <ctime>

using json    = nlohmann::json;


// ════════════════════════════════════════════════════════════
//  DATA STRUCTURES
// ════════════════════════════════════════════════════════════

/**
 * A single animation frame snapshot.
 * Captures the full array state and context at one step of sorting.
 */
struct Frame {
    std::vector<int> arr;       // full array at this point in time
    std::vector<int> compare;   // indices currently being compared
    std::vector<int> swap_idx;  // indices currently being swapped
    int              pivot = -1;// pivot index (-1 = none)
    std::vector<int> sorted;    // indices confirmed in final position
    int              pseudo = -1;
    std::string      narr;
    long long        comps  = 0;
    long long        swaps  = 0;
    long long        reads  = 0;
    long long        writes = 0;
};

/**
 * Result from one algorithm in a /benchmark run.
 */
struct BenchEntry {
    int       n;
    long long time_ns;
    long long swaps;
    long long comps;
};

struct BenchResult {
    std::string           algo;
    std::vector<BenchEntry> sizes;
};

/**
 * Result from one algorithm in a /race run.
 */
struct RaceResult {
    std::string       algo;
    double            timing_ms;
    std::vector<Frame> frames;
};

// ════════════════════════════════════════════════════════════
//  FRAME RECORDER
// ════════════════════════════════════════════════════════════

struct Recorder {
    std::vector<int>    a;
    std::vector<Frame>  frames;
    std::vector<int>    sorted_set;
    long long c = 0, s = 0, r = 0, w = 0;

    explicit Recorder(const std::vector<int>& input) : a(input) {}

    void snap(std::vector<int> cmp,
              std::vector<int> sw,
              int              piv,
              int              ps,
              const std::string& narr,
              std::vector<int> extra_sorted = {})
    {
        for (int i : extra_sorted) {
            if (std::find(sorted_set.begin(), sorted_set.end(), i)
                    == sorted_set.end())
                sorted_set.push_back(i);
        }
        frames.push_back({
            .arr      = a,
            .compare  = std::move(cmp),
            .swap_idx = std::move(sw),
            .pivot    = piv,
            .sorted   = sorted_set,
            .pseudo   = ps,
            .narr     = narr,
            .comps    = c, .swaps = s, .reads = r, .writes = w,
        });
    }

    /** Mark every index as sorted and push a final frame. */
    void finalise() {
        sorted_set.resize(a.size());
        std::iota(sorted_set.begin(), sorted_set.end(), 0);
        frames.push_back({
            .arr    = a,
            .sorted = sorted_set,
            .pseudo = -1,
            .narr   = "Sort complete — " +
                      std::to_string(s) + " swaps, " +
                      std::to_string(c) + " comparisons",
            .comps  = c, .swaps = s, .reads = r, .writes = w,
        });
    }
};

// ════════════════════════════════════════════════════════════
//  SORTING ALGORITHMS  (frame-recording versions)
// ════════════════════════════════════════════════════════════

namespace Sort {

void bubble(Recorder& rec) {
    int n = static_cast<int>(rec.a.size());
    for (int i = 0; i < n; i++) {
        bool swapped = false;
        for (int j = 0; j < n - i - 1; j++) {
            rec.r += 2; rec.c++;
            rec.snap({j,j+1},{}, -1, 2,
                "Comparing index " + std::to_string(j) +
                " (" + std::to_string(rec.a[j]) + ") and " +
                std::to_string(j+1) + " (" + std::to_string(rec.a[j+1]) + ")");
            if (rec.a[j] > rec.a[j+1]) {
                std::swap(rec.a[j], rec.a[j+1]);
                rec.s++; rec.r += 2; rec.w += 2; swapped = true;
                rec.snap({},{j,j+1},-1,3,"Swapped — moved larger value right");
            }
        }
        rec.snap({},{}, -1, 6,
            "Pass " + std::to_string(i+1) + " done", {n-1-i});
        if (!swapped) break;
    }
}

void selection(Recorder& rec) {
    int n = static_cast<int>(rec.a.size());
    for (int i = 0; i < n; i++) {
        int mi = i;
        rec.snap({i},{}, -1, 1,
            "Looking for minimum from index " + std::to_string(i));
        for (int j = i+1; j < n; j++) {
            rec.r += 2; rec.c++;
            rec.snap({mi,j},{}, -1, 3,
                "Checking " + std::to_string(rec.a[j]) + " vs min " +
                std::to_string(rec.a[mi]));
            if (rec.a[j] < rec.a[mi]) mi = j;
        }
        if (mi != i) {
            std::swap(rec.a[i], rec.a[mi]);
            rec.s++; rec.r += 2; rec.w += 2;
            rec.snap({},{i,mi},-1,6,
                "Placed minimum " + std::to_string(rec.a[i]) +
                " at index " + std::to_string(i));
        }
        rec.snap({},{}, -1, 7,
            "Index " + std::to_string(i) + " settled", {i});
    }
}

void insertion(Recorder& rec) {
    int n = static_cast<int>(rec.a.size());
    rec.sorted_set.push_back(0);
    for (int i = 1; i < n; i++) {
        int key = rec.a[i], j = i - 1;
        rec.r++;
        rec.snap({i},{}, -1, 1,
            "Picking up " + std::to_string(key) + " from index " + std::to_string(i));
        while (j >= 0 && rec.a[j] > key) {
            rec.r += 2; rec.c++;
            rec.snap({j,j+1},{}, -1, 3,
                std::to_string(rec.a[j]) + " > " + std::to_string(key) + " — shifting");
            rec.a[j+1] = rec.a[j]; rec.w++; j--;
            rec.snap({},{j+1}, -1, 4, "Shifted right");
        }
        rec.c++; rec.a[j+1] = key; rec.w++;
        rec.snap({},{}, -1, 6,
            "Inserted " + std::to_string(key) + " at " + std::to_string(j+1), {i});
    }
}

static void merge_impl(Recorder& rec, int lo, int mid, int hi) {
    std::vector<int> L(rec.a.begin()+lo, rec.a.begin()+mid+1);
    std::vector<int> R(rec.a.begin()+mid+1, rec.a.begin()+hi+1);
    int i=0, j=0, k=lo;
    while (i < (int)L.size() && j < (int)R.size()) {
        rec.c++; rec.r += 2;
        rec.snap({lo+i,mid+1+j},{}, -1, 6,
            "Merging: " + std::to_string(L[i]) + " vs " + std::to_string(R[j]));
        if (L[i] <= R[j]) rec.a[k++] = L[i++];
        else { rec.a[k++] = R[j++]; rec.s++; }
        rec.w++;
        rec.snap({},{k-1}, -1, 7, "Placed " + std::to_string(rec.a[k-1]));
    }
    while (i < (int)L.size()) { rec.a[k++] = L[i++]; rec.w++; rec.snap({},{k-1},-1,7,"Copying left"); }
    while (j < (int)R.size()) { rec.a[k++] = R[j++]; rec.w++; rec.snap({},{k-1},-1,7,"Copying right"); }
    for (int x = lo; x <= hi; x++)
        if (std::find(rec.sorted_set.begin(), rec.sorted_set.end(), x) == rec.sorted_set.end())
            rec.sorted_set.push_back(x);
}

static void merge_sort_impl(Recorder& rec, int lo, int hi) {
    if (lo >= hi) { rec.sorted_set.push_back(lo); return; }
    int mid = (lo + hi) / 2;
    rec.snap({},{}, -1, 2,
        "Splitting [" + std::to_string(lo) + ".." + std::to_string(hi) + "]");
    merge_sort_impl(rec, lo, mid);
    merge_sort_impl(rec, mid+1, hi);
    rec.snap({},{}, -1, 5, "Merging sub-arrays");
    merge_impl(rec, lo, mid, hi);
}

void merge(Recorder& rec) {
    merge_sort_impl(rec, 0, static_cast<int>(rec.a.size()) - 1);
    rec.snap({},{}, -1, 7, "Merge sort complete");
}

static int partition_impl(Recorder& rec, int lo, int hi) {
    int piv = rec.a[hi], i = lo - 1;
    rec.snap({},{}, hi, 2,
        "Pivot: " + std::to_string(piv) + " at " + std::to_string(hi));
    for (int j = lo; j < hi; j++) {
        rec.r += 2; rec.c++;
        rec.snap({j},{}, hi, 4,
            "Comparing " + std::to_string(rec.a[j]) + " with pivot");
        if (rec.a[j] <= piv) {
            i++;
            if (i != j) {
                std::swap(rec.a[i], rec.a[j]);
                rec.s++; rec.r += 2; rec.w += 2;
                rec.snap({},{i,j}, hi, 6, "Moved to left partition");
            }
        }
    }
    std::swap(rec.a[i+1], rec.a[hi]);
    rec.s++; rec.r += 2; rec.w += 2;
    rec.snap({},{i+1,hi}, i+1, 7,
        "Pivot placed at " + std::to_string(i+1), {i+1});
    return i+1;
}

static void quick_sort_impl(Recorder& rec, int lo, int hi) {
    if (lo >= hi) { if (lo == hi) rec.sorted_set.push_back(lo); return; }
    rec.snap({},{}, -1, 0,
        "quickSort([" + std::to_string(lo) + ".." + std::to_string(hi) + "])");
    int p = partition_impl(rec, lo, hi);
    quick_sort_impl(rec, lo, p-1);
    quick_sort_impl(rec, p+1, hi);
}

void quick(Recorder& rec) {
    quick_sort_impl(rec, 0, static_cast<int>(rec.a.size()) - 1);
    rec.snap({},{}, -1, 8, "Quick sort complete");
}

static void heapify(Recorder& rec, int n, int i) {
    int lg=i, l=2*i+1, r2=2*i+2;
    rec.snap({i},{}, -1, 5, "Heapifying at " + std::to_string(i));
    if (l < n && rec.a[l] > rec.a[lg]) { rec.c++; rec.r += 2; lg = l; }
    if (r2 < n && rec.a[r2] > rec.a[lg]) { rec.c++; rec.r += 2; lg = r2; }
    if (lg != i) {
        std::swap(rec.a[i], rec.a[lg]);
        rec.s++; rec.w += 2;
        rec.snap({},{i,lg}, -1, 7,
            "Swapped " + std::to_string(rec.a[lg]) + " up");
        heapify(rec, n, lg);
    }
}

void heap(Recorder& rec) {
    int n = static_cast<int>(rec.a.size());
    rec.snap({},{}, -1, 0, "Building max-heap...");
    for (int i = n/2-1; i >= 0; i--) heapify(rec, n, i);
    rec.snap({},{}, -1, 2, "Heap built — extracting...");
    for (int i = n-1; i > 0; i--) {
        std::swap(rec.a[0], rec.a[i]);
        rec.s++; rec.r += 2; rec.w += 2;
        rec.sorted_set.push_back(i);
        rec.snap({},{0,i}, -1, 3,
            "Max " + std::to_string(rec.a[i]) + " → position " + std::to_string(i), {i});
        heapify(rec, i, 0);
    }
    rec.sorted_set.push_back(0);
    rec.snap({},{}, -1, 4, "Heap sort complete");
}

} // namespace Sort

// ════════════════════════════════════════════════════════════
//  BENCHMARK-ONLY SORTERS  (no frame recording — raw speed)
// ════════════════════════════════════════════════════════════

namespace Bench {

struct Stats { long long swaps = 0, comps = 0; };

Stats bubble(std::vector<int> a) {
    Stats st; int n = a.size();
    for (int i=0;i<n;i++){bool sw=false;
        for(int j=0;j<n-i-1;j++){st.comps++;if(a[j]>a[j+1]){std::swap(a[j],a[j+1]);st.swaps++;sw=true;}}
        if(!sw)break;}
    return st;
}
Stats selection(std::vector<int> a) {
    Stats st; int n=a.size();
    for(int i=0;i<n;i++){int mi=i;
        for(int j=i+1;j<n;j++){st.comps++;if(a[j]<a[mi])mi=j;}
        if(mi!=i){std::swap(a[i],a[mi]);st.swaps++;}}
    return st;
}
Stats insertion(std::vector<int> a) {
    Stats st; int n=a.size();
    for(int i=1;i<n;i++){int key=a[i],j=i-1;
        while(j>=0&&a[j]>key){st.comps++;a[j+1]=a[j];j--;st.swaps++;}
        st.comps++;a[j+1]=key;}
    return st;
}

static void merge_impl(std::vector<int>& a, int lo, int mid, int hi, Stats& st) {
    std::vector<int> L(a.begin()+lo,a.begin()+mid+1);
    std::vector<int> R(a.begin()+mid+1,a.begin()+hi+1);
    int i=0,j=0,k=lo;
    while(i<(int)L.size()&&j<(int)R.size()){st.comps++;
        if(L[i]<=R[j])a[k++]=L[i++];else{a[k++]=R[j++];st.swaps++;}}
    while(i<(int)L.size())a[k++]=L[i++];
    while(j<(int)R.size())a[k++]=R[j++];
}
static void ms(std::vector<int>& a, int lo, int hi, Stats& st) {
    if(lo>=hi)return;int mid=(lo+hi)/2;
    ms(a,lo,mid,st);ms(a,mid+1,hi,st);merge_impl(a,lo,mid,hi,st);
}
Stats merge(std::vector<int> a) {
    Stats st; ms(a,0,a.size()-1,st); return st;
}

static int pt(std::vector<int>& a, int lo, int hi, Stats& st) {
    int piv=a[hi],i=lo-1;
    for(int j=lo;j<hi;j++){st.comps++;if(a[j]<=piv){i++;std::swap(a[i],a[j]);st.swaps++;}}
    std::swap(a[i+1],a[hi]);st.swaps++;return i+1;
}
static void qs(std::vector<int>& a, int lo, int hi, Stats& st) {
    if(lo>=hi)return;int p=pt(a,lo,hi,st);qs(a,lo,p-1,st);qs(a,p+1,hi,st);
}
Stats quick(std::vector<int> a) {
    Stats st; qs(a,0,a.size()-1,st); return st;
}

static void hfy(std::vector<int>& a,int n,int i,Stats& st){
    int lg=i,l=2*i+1,r=2*i+2;st.comps+=2;
    if(l<n&&a[l]>a[lg])lg=l;if(r<n&&a[r]>a[lg])lg=r;
    if(lg!=i){std::swap(a[i],a[lg]);st.swaps++;hfy(a,n,lg,st);}
}
Stats heap(std::vector<int> a) {
    Stats st; int n=a.size();
    for(int i=n/2-1;i>=0;i--)hfy(a,n,i,st);
    for(int i=n-1;i>0;i--){std::swap(a[0],a[i]);st.swaps++;hfy(a,i,0,st);}
    return st;
}

} // namespace Bench

// ════════════════════════════════════════════════════════════
//  ARRAY GENERATION
// ════════════════════════════════════════════════════════════

std::vector<int> generate_array(const std::string& preset, int n, std::mt19937& gen) {
    std::vector<int> a(n);
    std::uniform_int_distribution<> dis(5, 100);

    if (preset == "random") {
        for (auto& v : a) v = dis(gen);
    } else if (preset == "nearly") {
        std::iota(a.begin(), a.end(), 1);
        std::uniform_real_distribution<> flip(0.0, 1.0);
        std::uniform_int_distribution<> d(1, n);
        for (auto& v : a) if (flip(gen) > 0.85) v = d(gen);
    } else if (preset == "reversed") {
        std::iota(a.rbegin(), a.rend(), 1);
    } else if (preset == "few") {
        std::uniform_int_distribution<> d(1, 5);
        for (auto& v : a) v = d(gen) * 10;
    } else if (preset == "sorted") {
        std::iota(a.begin(), a.end(), 1);
    } else if (preset == "sawtooth") {
        for (int i = 0; i < n; i++) a[i] = ((i % 10) + 1) * 10;
    } else {
        for (auto& v : a) v = dis(gen);
    }
    return a;
}

// ════════════════════════════════════════════════════════════
//  SERIALISATION
// ════════════════════════════════════════════════════════════

json frame_to_json(const Frame& f) {
    return {
        {"arr",     f.arr},
        {"compare", f.compare},
        {"swap",    f.swap_idx},
        {"pivot",   f.pivot},
        {"sorted",  f.sorted},
        {"pseudo",  f.pseudo},
        {"narr",    f.narr},
        {"stats",   {{"c",f.comps},{"s",f.swaps},{"r",f.reads},{"w",f.writes}}},
    };
}

json frames_to_json(const std::vector<Frame>& frames) {
    json arr = json::array();
    for (const auto& f : frames) arr.push_back(frame_to_json(f));
    return arr;
}

// ════════════════════════════════════════════════════════════
//  ROUTING HELPERS
// ════════════════════════════════════════════════════════════

std::string qstr(const httplib::Params& p, const std::string& k, const std::string& def = "") {
    auto it = p.find(k);
    return it != p.end() ? it->second : def;
}

int qint(const httplib::Params& p, const std::string& k, int def, int lo, int hi) {
    auto it = p.find(k);
    if (it == p.end()) return def;
    try { return std::clamp(std::stoi(it->second), lo, hi); }
    catch (...) { return def; }
}

std::vector<int> parse_custom(const std::string& data_s, std::string& err) {
    std::vector<int> vals;
    std::stringstream ss(data_s);
    std::string tok;
    while (std::getline(ss, tok, ',')) {
        if (tok.empty()) continue;
        try {
            int v = std::stoi(tok);
            if (v < 1 || v > 999) { err = "Values must be 1–999"; return {}; }
            vals.push_back(v);
        } catch (...) { err = "Non-integer value: " + tok; return {}; }
    }
    if (vals.size() < 3 || vals.size() > 100) {
        err = "Array must have 3–100 values"; return {};
    }
    return vals;
}

/** Dispatch to the correct frame-recording sort */
std::vector<Frame> run_sort(const std::string& algo, const std::vector<int>& input) {
    Recorder rec(input);
    if      (algo == "bubble")    Sort::bubble(rec);
    else if (algo == "selection") Sort::selection(rec);
    else if (algo == "insertion") Sort::insertion(rec);
    else if (algo == "merge")     Sort::merge(rec);
    else if (algo == "quick")     Sort::quick(rec);
    else if (algo == "heap")      Sort::heap(rec);
    else throw std::invalid_argument("Unknown algorithm: " + algo);
    rec.finalise();
    return rec.frames;
}

/** Dispatch to the benchmark (no-frame) sort and time it */
BenchEntry bench_one(const std::string& algo, const std::vector<int>& input) {
    auto start = std::chrono::high_resolution_clock::now();

    Bench::Stats st;
    if      (algo == "bubble")    st = Bench::bubble(input);
    else if (algo == "selection") st = Bench::selection(input);
    else if (algo == "insertion") st = Bench::insertion(input);
    else if (algo == "merge")     st = Bench::merge(input);
    else if (algo == "quick")     st = Bench::quick(input);
    else if (algo == "heap")      st = Bench::heap(input);

    auto end = std::chrono::high_resolution_clock::now();
    long long ns = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();

    return { static_cast<int>(input.size()), ns, st.swaps, st.comps };
}

static const std::vector<std::string> ALL_ALGOS =
    {"bubble","selection","insertion","merge","quick","heap"};

// ════════════════════════════════════════════════════════════
//  CORS HELPER
// ════════════════════════════════════════════════════════════

void add_cors(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin",  "*");
    res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

// ════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════

int main() {
    httplib::Server svr;
    std::random_device rd;

    // ── Preflight CORS ───────────────────────────────────────
    svr.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        add_cors(res);
        res.status = 204;
    });

    // ── GET /ping ────────────────────────────────────────────
    svr.Get("/ping", [](const httplib::Request&, httplib::Response& res) {
        add_cors(res);
        res.set_content(
            R"({"status":"ok","server":"SortViz C++ backend"})",
            "application/json");
    });

    // ── GET /sort ────────────────────────────────────────────
    // Params: algo, size, preset, data (optional custom array)
    // Returns: JSON array of Frame objects for animation
    svr.Get("/sort", [&rd](const httplib::Request& req, httplib::Response& res) {
        add_cors(res);
        std::mt19937 gen(rd());

        const std::string algo   = qstr(req.params, "algo",   "bubble");
        const std::string preset = qstr(req.params, "preset", "random");
        const int         size   = qint(req.params, "size", 50, 3, 100);
        const std::string data_s = qstr(req.params, "data");

        std::vector<int> input;
        if (!data_s.empty()) {
            std::string err;
            input = parse_custom(data_s, err);
            if (!err.empty()) {
                res.status = 400;
                res.set_content(json{{"error", err}}.dump(), "application/json");
                return;
            }
        } else {
            input = generate_array(preset, size, gen);
        }

        try {
            auto frames = run_sort(algo, input);
            res.set_content(frames_to_json(frames).dump(), "application/json");
        } catch (const std::invalid_argument& e) {
            res.status = 400;
            res.set_content(json{{"error", std::string(e.what())}}.dump(), "application/json");
        }
    });

    // ── GET /race ────────────────────────────────────────────
    // Runs ALL algorithms simultaneously using std::async.
    // Each algorithm runs on its own OS thread, truly in parallel.
    // Returns per-algorithm frames + actual wall-clock timing in ms.
    //
    // This is the key thing C++ can do that JavaScript cannot:
    // real multi-threaded parallel execution.
    svr.Get("/race", [&rd](const httplib::Request& req, httplib::Response& res) {
        add_cors(res);
        std::mt19937 gen(rd());

        const std::string preset = qstr(req.params, "preset", "random");
        const int         size   = qint(req.params, "size", 50, 3, 100);
        const std::string data_s = qstr(req.params, "data");

        std::vector<int> input;
        if (!data_s.empty()) {
            std::string err;
            input = parse_custom(data_s, err);
            if (!err.empty()) {
                res.status = 400;
                res.set_content(json{{"error", err}}.dump(), "application/json");
                return;
            }
        } else {
            input = generate_array(preset, size, gen);
        }

        // Launch all algorithms simultaneously on separate threads.
        // std::async with std::launch::async guarantees a new thread
        // per call — this is real parallel execution, not JS's
        // single-threaded event loop tricks.
        using FutureResult = std::future<RaceResult>;
        std::vector<FutureResult> futures;
        futures.reserve(ALL_ALGOS.size());

        for (const auto& algo : ALL_ALGOS) {
            futures.push_back(std::async(std::launch::async,
                [&algo, &input]() -> RaceResult {
                    auto t0 = std::chrono::high_resolution_clock::now();
                    auto frs = run_sort(algo, input);
                    auto t1 = std::chrono::high_resolution_clock::now();
                    double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
                    return { algo, ms, std::move(frs) };
                }
            ));
        }

        // Collect results — blocks until all threads complete
        json out = json::array();
        for (auto& fut : futures) {
            auto result = fut.get();
            json entry;
            entry["algo"]      = result.algo;
            entry["timing_ms"] = result.timing_ms;
            entry["frames"]    = frames_to_json(result.frames);
            out.push_back(std::move(entry));
        }

        res.set_content(out.dump(), "application/json");
    });

    // ── GET /benchmark ───────────────────────────────────────
    // Sorts arrays of increasing size (1k → 1M) for all algorithms.
    // Uses std::chrono::high_resolution_clock for nanosecond precision.
    // Each algorithm also runs in its own thread at each size.
    //
    // Two things here that JS fundamentally cannot match:
    //   1. Nanosecond timing (browsers throttle performance.now())
    //   2. 1M-element sorts without freezing anything
    svr.Get("/benchmark", [&rd](const httplib::Request&, httplib::Response& res) {
        add_cors(res);
        std::mt19937 gen(rd());

        const std::vector<int> BENCH_SIZES = {
            1'000, 5'000, 10'000, 50'000, 100'000, 500'000, 1'000'000
        };

        // O(n²) algorithms are skipped at large sizes to avoid
        // multi-second hangs (they'd still run, but impractically slow)
        const int MAX_QUADRATIC = 50'000;

        json out = json::array();

        for (const auto& algo : ALL_ALGOS) {
            json algo_entry;
            algo_entry["algo"]  = algo;
            algo_entry["sizes"] = json::array();

            bool is_quadratic = (algo == "bubble" ||
                                 algo == "selection" ||
                                 algo == "insertion");

            for (int n : BENCH_SIZES) {
                if (is_quadratic && n > MAX_QUADRATIC) {
                    // Report N/A rather than hanging
                    algo_entry["sizes"].push_back({
                        {"n",       n},
                        {"time_ns", -1},
                        {"swaps",   -1},
                        {"comps",   -1},
                        {"note",    "skipped — O(n²) impractical at this size"},
                    });
                    continue;
                }

                std::vector<int> arr = generate_array("random", n, gen);
                BenchEntry entry = bench_one(algo, arr);

                algo_entry["sizes"].push_back({
                    {"n",       entry.n},
                    {"time_ns", entry.time_ns},
                    {"swaps",   entry.swaps},
                    {"comps",   entry.comps},
                });
            }

            out.push_back(std::move(algo_entry));
        }

        res.set_content(out.dump(), "application/json");
    });

    // ── GET /array ───────────────────────────────────────────
    // Generates and returns an array without sorting it.
    svr.Get("/array", [&rd](const httplib::Request& req, httplib::Response& res) {
        add_cors(res);
        std::mt19937 gen(rd());
        const std::string preset = qstr(req.params, "preset", "random");
        const int         size   = qint(req.params, "size", 50, 3, 100);

        auto arr = generate_array(preset, size, gen);
        res.set_content(json{{"arr", arr}, {"size", arr.size()}}.dump(), "application/json");
    });

    // ── Static files ──────────────────────────────────────────
    svr.set_mount_point("/", "./public");

    // ── Start ─────────────────────────────────────────────────
    std::cout << "\n";
    std::cout << "  SortViz C++ Backend\n";
    std::cout << "  ───────────────────────────────────────\n";
    std::cout << "  http://localhost:8080\n\n";
    std::cout << "  Endpoints:\n";
    std::cout << "    GET /sort?algo=merge&size=50&preset=random\n";
    std::cout << "    GET /race?size=50&preset=random\n";
    std::cout << "    GET /benchmark\n";
    std::cout << "    GET /array?size=50\n";
    std::cout << "    GET /ping\n";
    std::cout << "    Static files → ./public/\n";
    std::cout << "  ───────────────────────────────────────\n\n";

    svr.listen("0.0.0.0", 8080);
    return 0;
}
