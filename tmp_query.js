const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: triggers } = await supabase.rpc('get_trigger_def_temp_xyz').catch(() => ({}));
    if (triggers) {
        console.log("Triggers:", JSON.stringify(triggers, null, 2));
        return;
    }

    // Try directly asking postgres using a custom function if one exists, or query views
    const res = await supabase.from('telemetry_raw').select('id').limit(1);
    console.log(res);
}
run();
