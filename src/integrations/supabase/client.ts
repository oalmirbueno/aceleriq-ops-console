import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://grxljyocuadywcksfyvu.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGxqeW9jdWFkeXdja3NmeXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDMzNjcsImV4cCI6MjA5MTc3OTM2N30.K1-tFjyfHdZIUDDRV5I14GTwl4mpvfGVNt55BAkgDnM";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
