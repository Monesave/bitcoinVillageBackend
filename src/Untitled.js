import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY 
)

const { error, data } = await supabase
  .from('users')
  .select('*')
  .limit(1)

if (error?.code === '42P01') {
  console.log('Table does NOT exist')
} else if (error) {
  console.error('Other error:', error)
} else {
  console.log('Table exists')
  console.log(data)
}
