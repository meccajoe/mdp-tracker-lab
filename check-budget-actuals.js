const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://yaftybqzlbbvzwwdzlny.supabase.co',
  '__REMOVED_SUPABASE_SERVICE_ROLE_CREDENTIAL__'
);

async function run() {
  // Pick a few active projects with expenses and check budget vs actual
  const { data: projects } = await sb
    .from('projects')
    .select('id, job_number, name, contract_amount, budget_fabrication, budget_graphics, budget_install, budget_design, budget_shipping, budget_travel, budget_pm')
    .eq('status', 'Active')
    .limit(5);

  for (const p of projects) {
    const { data: expenses } = await sb
      .from('expenses')
      .select('category, amount')
      .eq('project_id', p.id);

    const actuals = {};
    for (const e of expenses || []) {
      actuals[e.category] = (actuals[e.category] || 0) + e.amount;
    }

    const totalActual = Object.values(actuals).reduce((s, v) => s + v, 0);
    const totalBudget = [
      p.budget_fabrication, p.budget_graphics, p.budget_install,
      p.budget_design, p.budget_shipping, p.budget_travel, p.budget_pm
    ].reduce((s, v) => s + (v || 0), 0);

    console.log(`\n${p.job_number} — ${p.name}`);
    console.log(`  Contract: $${p.contract_amount?.toLocaleString()}`);
    console.log(`  Budget total: $${totalBudget.toLocaleString()}`);
    console.log(`  Actual spend: $${totalActual.toLocaleString()}`);
    console.log(`  % used: ${totalBudget > 0 ? ((totalActual/totalBudget)*100).toFixed(1) : 'N/A'}%`);
    console.log(`  Expense categories:`, Object.entries(actuals).map(([k,v]) => `${k}: $${v.toFixed(0)}`).join(', ') || 'none');
  }
}
run().catch(console.error);
