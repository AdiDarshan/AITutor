import py101Json from "@/content/py101/course.json";
import scienceJson from "@/content/everyday_science/course.json";
import iceJson from "@/content/ice_and_water/course.json";
import { mapCoursePack } from "./mapCoursePack";
import type { CoursePack } from "./types";

// All bundled course packs (validated at load time).
const RAW_COURSES: unknown[] = [py101Json, scienceJson, iceJson];

/** Validate and return all bundled course packs. Throws on the first invalid one. */
export function loadAllCourses(): CoursePack[] {
  return RAW_COURSES.map(mapCoursePack);
}

/** Convenience: the first course pack. */
export function loadCoursePack(): CoursePack {
  return mapCoursePack(RAW_COURSES[0]);
}
