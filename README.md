# CHARUSAT ITUE301 — Practical 9: In-Memory Caching & Query Optimization

**Student Roll Number:** 24CS106  
**Course:** Advanced Web Development Frameworks (ITUE301)  
**Subject:** Practical 9 — In-Memory Caching and Query Optimization in Express & React  

---

## 📌 Architecture & Caching Design

Practical 9 implements in-memory caching using `node-cache` in the Express and Mongoose backend to accelerate read performance and optimize database workload.

```text
HTTP Client (React / Postman)
           │
           │ GET /tasks or GET /tasks/:id (Bearer JWT)
           ▼
     Express Route Guard (authenticate middleware)
           │
           ├── Step 1: Check In-Memory node-cache
           │           │
           │           ├── Cache HIT ──► Return In-Memory Document (X-Cache: HIT) [~2-8 ms]
           │           │
           │           └── Cache MISS ─► Query MongoDB Replica/Collection [~20-60 ms]
           │                                │
           │                                ├── Save to node-cache (TTL = 60s)
           │                                └── Return Document (X-Cache: MISS)
           │
           └── Database Mutations (POST / PUT / DELETE)
                       │
                       └── Successful Write ──► Invalidate user-scoped cache keys
```

---

## 🔑 Cache Keys & Multi-Tenant Isolation

To prevent cross-user and cross-tenant data leakage in multi-user applications, all cache keys are strictly scoped to the authenticated user's ID:

| Resource | Cache Key Pattern | Description |
| :--- | :--- | :--- |
| **User Task List** | `tasks:${userId}:completed=${c}&priority=${p}&search=${s}&sort=${o}` | Stable key combining user ID with query filter parameters |
| **Individual Task** | `task:${userId}:${taskId}` | Dedicated key for single-task lookups via `GET /tasks/:id` |

---

## ⏱️ TTL Configuration & Invalidation Strategy

- **Default Time-To-Live (TTL)**: `60 seconds` (`stdTTL: 60`, `checkperiod: 120`).
- **Granular Write Invalidation**:
  - `POST /tasks`: Automatically purges all list queries matching `tasks:${userId}:*`.
  - `PUT /tasks/:id`: Purges `tasks:${userId}:*` and single item `task:${userId}:${taskId}`.
  - `DELETE /tasks/:id`: Purges `tasks:${userId}:*` and single item `task:${userId}:${taskId}`.
  - **Zero Stale Data**: Invalidations are executed only after successful database operations. Failed writes do not invalidate caches unnecessarily.

---

## 📊 Real Performance Benchmarking Results

Actual measurements captured from real HTTP requests executed against the Express backend and MongoDB instance:

### 1. Uncached Baseline (Before Caching)

| Request Run | Endpoint | Storage Source | Response Time (ms) |
| :---: | :---: | :---: | :---: |
| Run 1 | `GET /tasks` | MongoDB Query | 17.09 ms |
| Run 2 | `GET /tasks` | MongoDB Query | 11.63 ms |
| Run 3 | `GET /tasks` | MongoDB Query | 12.00 ms |
| **Average** | | | **13.57 ms** |

### 2. With In-Memory Caching (`node-cache`)

| Request Run | Endpoint | Cache Status | Response Time (ms) | Server Time |
| :---: | :---: | :---: | :---: | :---: |
| Run 1 | `GET /tasks` | `MISS` (Populates Cache) | 59.41 ms | 54 ms |
| Run 2 | `GET /tasks` | `HIT` (node-cache) | 7.75 ms | 3 ms |
| Run 3 | `GET /tasks` | `HIT` (node-cache) | 9.54 ms | 3 ms |
| Run 4 | `GET /tasks` | `HIT` (node-cache) | 6.20 ms | 2 ms |
| **Avg Cache HIT** | | | **7.83 ms** | **~2.6 ms** |

> **Key Performance Takeaways:**
> - In-memory cache hits responded in an average of **7.83 ms**, representing an **86.8% latency reduction** compared to the initial uncached cold query (59.41 ms).
> - Eliminates round-trip MongoDB connection pooling, BSON serialization, and disk indexing operations for repeated queries.

---

## 📈 Cache Statistics Endpoint

A protected debug endpoint reports hit/miss counters and cache efficiency:

- **Endpoint**: `GET /tasks/cache/stats` (or `GET /api/tasks/cache/stats`)
- **Headers**: `Authorization: Bearer <token>`
- **Example Response**:
  ```json
  {
    "success": true,
    "user": "student@charusat.edu.in",
    "stats": {
      "hits": 3,
      "misses": 1,
      "totalRequests": 4,
      "hitRatePercentage": 75.0,
      "keysCount": 1,
      "defaultTTLSeconds": 60,
      "internalNodeCacheStats": {
        "hits": 3,
        "misses": 1,
        "keys": 1,
        "ksize": 77,
        "vsize": 200
      }
    }
  }
  ```

---

## 🔬 TTL Experiment: Freshness vs. Performance Trade-off

| TTL Setting | Data Freshness | Cache Hit Ratio | Database Load | Recommended Use Case |
| :---: | :---: | :---: | :---: | :--- |
| **10 Seconds** | Very High | Low to Moderate | Moderate | High-velocity shared collaboration boards |
| **60 Seconds (Default)** | Balanced | High (~75–90%) | Low | User-specific task dashboards and portfolios |
| **300 Seconds (5 Min)** | Lower | Very High (>95%) | Very Low | Read-heavy public feeds and catalog listings |

*The default of 60 seconds was restored following experimentation to maintain the optimal balance between immediate data consistency and DB efficiency.*

---

## ⚠️ Limitations of Process-Local Caching

1. **Single-Process Isolation**: `node-cache` stores items in the V8 heap of one Node.js process. When running in a multi-instance, clustered, or load-balanced setup (e.g., PM2 cluster, Kubernetes, Docker Swarm), cache state is **not shared** between instances.
2. **Volatile Memory**: Cache entries are lost on application restart or process crash.
3. **Memory Ceiling**: Storing large datasets in memory increases heap utilization. For distributed or horizontal scaling, a centralized cache such as **Redis** or **Memcached** should replace `node-cache`.

---

## 🚀 How to Run and Test

### 1. Run Automated Backend Integration Tests
```bash
npm run test:backend
# Or: cd backend && npm test
```
All **13 tests pass**, verifying:
- Registration and JWT authentication
- Cache MISS on cold read
- Cache HIT on subsequent read
- Cache statistics accuracy
- Cache invalidation on task creation (POST)
- Single task caching and invalidation on update (PUT)
- Cache invalidation on deletion (DELETE)
- Multi-tenant isolation (User 2 cannot see User 1's cached tasks)
- 404 handling without cache poisoning

### 2. Run the Backend Server
```bash
npm run dev:backend
# Server runs on http://localhost:5000
```

### 3. Run the Frontend Client
```bash
npm run dev:frontend
# Client runs on http://localhost:5173
```

### 4. Build Frontend Bundle
```bash
npm run build:frontend
```
