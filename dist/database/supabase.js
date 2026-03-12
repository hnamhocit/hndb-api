"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.checkSupabaseHealth = checkSupabaseHealth;
const supabase_js_1 = require("@supabase/supabase-js");
const constants_1 = require("../constants");
const supabase = (0, supabase_js_1.createClient)(constants_1.constants.SUPABASE_URL, constants_1.constants.SUPABASE_SERVICE_ROLE_KEY);
exports.supabase = supabase;
async function checkSupabaseHealth() {
    try {
        const { error } = await supabase
            .from('data_sources')
            .select('id', { head: true })
            .limit(1);
        if (error) {
            throw error;
        }
        console.log('✅ Connected to Supabase SDK successfully!');
    }
    catch (error) {
        console.error('❌ Failed to connect to Supabase:', error.message);
    }
}
