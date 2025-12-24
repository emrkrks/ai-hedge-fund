// Supabase Edge Function: analyze-ben-graham
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAgentHandler } from "../_shared/agent-handler.ts";
serve(createAgentHandler("ben_graham"));
