import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Under full-suite load, async UI (router calls after a save) can exceed the
// 1 s default; waits still fail on a real miss, just later.
configure({ asyncUtilTimeout: 5000 });
