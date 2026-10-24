process.env.NODE_ENV = "test";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import app from "../src/server.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import { clearAllCache } from "../src/config/cache.js";

let server;
let baseUrl;

const user1Data = {
  email: `cache_test_user1_${Date.now()}@charusat.edu.in`,
  password: "password123",
};

const user2Data = {
  email: `cache_test_user2_${Date.now()}@charusat.edu.in`,
  password: "password456",
};

let user1Token = "";
let user2Token = "";
let user1TaskId = "";

before(async () => {
  // Clear any existing cache state
  clearAllCache();

  // Start server on an ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  // Cleanup test documents & cache
  clearAllCache();
  await User.deleteMany({ email: { $in: [user1Data.email, user2Data.email] } });
  if (user1TaskId) {
    await Task.findByIdAndDelete(user1TaskId);
  }
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

describe("Practical 9: In-Memory Caching & Query Optimization Tests", () => {
  // 1. Authentication Setup
  test("POST /auth/register - Successfully register User 1", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user1Data),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.user.email, user1Data.email.toLowerCase());
  });

  test("POST /auth/login - Successfully login User 1 and receive JWT", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user1Data),
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.token);
    user1Token = data.token;
  });

  test("POST /auth/register & login - Prepare User 2 for isolation testing", async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user2Data),
    });

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user2Data),
    });

    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    user2Token = loginData.token;
  });

  // 2. Initial Task Creation
  test("POST /tasks - Create initial task for User 1", async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        title: "Complete ITUE301 Practical 9",
        description: "In-memory caching with node-cache and query optimization",
        priority: "high",
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.data.title, "Complete ITUE301 Practical 9");
    user1TaskId = data.data._id;
  });

  // 3. GET /tasks Cache Miss on First Request
  test("GET /tasks - 1st request produces Cache MISS and populates cache", async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-cache"), "MISS");
    assert.equal(data.cached, false);
    assert.equal(data.count, 1);
    assert.equal(data.data[0].title, "Complete ITUE301 Practical 9");
  });

  // 4. GET /tasks Cache Hit on Repeated Request
  test("GET /tasks - 2nd request produces Cache HIT without querying MongoDB", async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-cache"), "HIT");
    assert.equal(data.cached, true);
    assert.equal(data.count, 1);
  });

  // 5. Cache Statistics Debug Endpoint
  test("GET /tasks/cache/stats - Reports accurate hits, misses, and hit rate", async () => {
    const res = await fetch(`${baseUrl}/tasks/cache/stats`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.stats.hits >= 1);
    assert.ok(data.stats.misses >= 1);
    assert.equal(data.stats.defaultTTLSeconds, 60);
  });

  // 6. Cache Invalidation on POST /tasks
  test("POST /tasks - Invalidates User 1 all-tasks cache so new task is immediately visible", async () => {
    const createRes = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        title: "Second Practical 9 Task",
        description: "Checking invalidation behavior",
        priority: "medium",
      }),
    });
    assert.equal(createRes.status, 201);

    // Subsequent GET /tasks must be a cache MISS and return count = 2
    const getRes = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const getData = await getRes.json();
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("x-cache"), "MISS");
    assert.equal(getData.cached, false);
    assert.equal(getData.count, 2);
  });

  // 7. Individual Task Caching GET /tasks/:id
  test("GET /tasks/:id - 1st request is Cache MISS, 2nd request is Cache HIT", async () => {
    // 1st request -> MISS
    const res1 = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const data1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get("x-cache"), "MISS");
    assert.equal(data1.cached, false);
    assert.equal(data1.data._id, user1TaskId);

    // 2nd request -> HIT
    const res2 = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const data2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get("x-cache"), "HIT");
    assert.equal(data2.cached, true);
    assert.equal(data2.data._id, user1TaskId);
  });

  // 8. Cache Invalidation on PUT /tasks/:id
  test("PUT /tasks/:id - Updates task and invalidates single-task & all-tasks cache", async () => {
    const updateRes = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        title: "Complete ITUE301 Practical 9 (Updated & Optimized)",
        completed: true,
      }),
    });
    const updateData = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updateData.data.title, "Complete ITUE301 Practical 9 (Updated & Optimized)");

    // GET /tasks/:id must be MISS with updated title
    const getSingleRes = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const getSingleData = await getSingleRes.json();
    assert.equal(getSingleRes.headers.get("x-cache"), "MISS");
    assert.equal(getSingleData.data.title, "Complete ITUE301 Practical 9 (Updated & Optimized)");

    // GET /tasks must also be MISS with updated title
    const getListRes = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const getListData = await getListRes.json();
    assert.equal(getListRes.headers.get("x-cache"), "MISS");
    assert.ok(getListData.data.some((t) => t.title.includes("(Updated & Optimized)")));
  });

  // 9. Cache Invalidation on DELETE /tasks/:id
  test("DELETE /tasks/:id - Deletes task and invalidates caches", async () => {
    const delRes = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(delRes.status, 200);

    // GET /tasks/:id must return 404
    const getDeletedRes = await fetch(`${baseUrl}/tasks/${user1TaskId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(getDeletedRes.status, 404);

    // GET /tasks must return count = 1 (only the second task remains)
    const getListRes = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const getListData = await getListRes.json();
    assert.equal(getListData.count, 1);
  });

  // 10. Multi-Tenant User Isolation (No Cross-Tenant Cache Leakage)
  test("Multi-Tenant Isolation - User 2 cannot see User 1's cached or saved tasks", async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.count, 0); // User 2 has 0 tasks, unaffected by User 1's cache
  });

  // 11. 404 for Invalid / Non-existent Task ID
  test("GET /tasks/:id - Returns 404 for nonexistent task and does not poison cache", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/tasks/${fakeId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(res.status, 404);
  });
});
