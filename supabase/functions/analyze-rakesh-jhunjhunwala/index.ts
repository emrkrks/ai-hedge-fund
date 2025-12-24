// Supabase Edge Function: analyze-rakesh-jhunjhunwala
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAgentHandler } from "../_shared/agent-handler.ts";
serve(createAgentHandler("rakesh_jhunjhunwala"));
