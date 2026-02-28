import { createClient } from '@supabase/supabase-js'

import { constants } from '../constants'

const supabase = createClient(
	constants.SUPABASE_URL!,
	constants.SUPABASE_SERVICE_ROLE_KEY!,
)

async function checkSupabaseHealth() {
	try {
		const { error } = await supabase
			.from('data_sources')
			.select('id', { head: true })
			.limit(1)

		if (error) {
			throw error
		}

		console.log('✅ Connected to Supabase SDK successfully!')
	} catch (error: any) {
		console.error('❌ Failed to connect to Supabase:', error.message)
	}
}

export { checkSupabaseHealth, supabase }
