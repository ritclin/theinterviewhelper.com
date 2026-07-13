import { InterviewScenario } from "./types";

export const INTERVIEW_SCENARIOS: InterviewScenario[] = [
  {
    id: "scenario-1",
    title: "React State Syncing & Stale Closures",
    role: "Senior Front-End Engineer",
    company: "Meta",
    transcript: "So, we have a custom hook that handles a debounced value. But several candidates complain that the value gets stuck or references old state values when updating rapidly. Can you show me how you'd implement a bullet-proof debouncer in React and avoid stale closures?",
    imageName: "React Debounce Hook Draft",
    mockImageText: `// Current Buggy Implementation in React 18+
import { useState, useEffect } from "react";

export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      // Is this capturing a stale value of "value"?
      setDebouncedValue(value);
    }, delay);

    // Missing clean-up function!
  }, []); // Empty dependency array causes stale closures!

  return debouncedValue;
}`
  },
  {
    id: "scenario-2",
    title: "LRU Cache Cache eviction O(1)",
    role: "Staff Software Engineer",
    company: "Google",
    transcript: "Let's design a Least Recently Used (LRU) Cache. I want you to walk me through the design. It needs to support get and put operations, both in O(1) time complexity. What data structures would you choose, and can you write the Python implementation?",
    imageName: "LRU Cache Design Canvas",
    mockImageText: `# LRU Cache Eviction Algorithm Structure
# Goal: Get and Put operations must be strictly O(1)

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        # How do we maintain order and do fast lookups simultaneously?
        pass

    def get(self, key: int) -> int:
        pass

    def put(self, key: int, value: int) -> None:
        pass`
  },
  {
    id: "scenario-3",
    title: "Relational Index Cover queries & Tuning",
    role: "Senior Backend Architect",
    company: "Stripe",
    transcript: "We have an active users table with over 100 million records. Our core dashboard query is running a sequence scan filtering by status='active' and ordering by created_at desc. It takes around 4.5 seconds. How would you index this table and optimize the query for sub-10ms performance?",
    imageName: "PostgreSQL EXPLAIN ANALYZE Dump",
    mockImageText: `-- Heavy Query on Large PostgreSQL Instance
SELECT email, username, created_at 
FROM users 
WHERE status = 'active' 
ORDER BY created_at DESC 
LIMIT 50;

-- EXPLAIN output shows:
-- -> Sequential Scan on users (cost=0.00..4120392.12 rows=12048 width=64)
-- -> Filter: (status = 'active'::text)
-- -> Manual Sort (Key: created_at DESC)`
  }
];
