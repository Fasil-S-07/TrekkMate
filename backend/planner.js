// Trek planner. Facts come from plain functions ("tools"); a language model,
// when configured, only decides which tools to call and explains the trade-offs.
// With no API key, a rule-based ranking uses the same tools directly.
import { readFileSync } from 'fs';

export const treks = JSON.parse(readFileSync(new URL('./data/treks.json', import.meta.url), 'utf8'));

const LEVEL = { easy: 1, moderate: 2, hard: 3 };
const FITNESS = { low: 1, medium: 2, high: 3 };
const FOOD_STAY_PER_DAY = 900; // planning allowance, INR per person
const TRANSPORT = 1000;        // planning allowance, INR per person
const find = id => treks.find(t => t.id === id);

export function searchTreks({ maxDays = 3, fitness = 'medium', region } = {}) {
  return treks
    .filter(t => t.days <= maxDays && LEVEL[t.difficulty] <= (FITNESS[fitness] || 2))
    .filter(t => !region || t.region.toLowerCase().includes(String(region).toLowerCase()))
    .map(({ id, name, region, days, difficulty }) => ({ id, name, region, days, difficulty }));
}

export function checkSeason({ trekId, month }) {
  const t = find(trekId);
  if (!t) return { error: 'Unknown trek' };
  const status = t.avoidMonths.includes(month) ? 'avoid' : t.bestMonths.includes(month) ? 'best' : 'okay';
  return { trek: t.name, month, status };
}

export function estimateBudget({ trekId, travelers = 1 }) {
  const t = find(trekId);
  if (!t) return { error: 'Unknown trek' };
  const perPerson = t.fee + t.days * FOOD_STAY_PER_DAY + TRANSPORT;
  return { trek: t.name, travelers, perPerson, total: perPerson * travelers, note: 'Planning estimate, not a live quote' };
}

const toolFns = { search_treks: searchTreks, check_season: checkSeason, estimate_budget: estimateBudget };

const fn = (name, description, properties, required = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

const toolSchemas = [
  fn('search_treks', 'Find treks within a day limit and fitness level.', {
    maxDays: { type: 'number' }, fitness: { type: 'string', enum: ['low', 'medium', 'high'] }, region: { type: 'string' } }),
  fn('check_season', 'Is a given month (1-12) good, okay or to be avoided for a trek?', {
    trekId: { type: 'string' }, month: { type: 'number' } }, ['trekId', 'month']),
  fn('estimate_budget', 'Estimate the total cost in INR for a group.', {
    trekId: { type: 'string' }, travelers: { type: 'number' } }, ['trekId'])
];

function rules(p, note) {
  const trace = [];
  const call = (name, args) => { const result = toolFns[name](args); trace.push({ tool: name, args, result }); return result; };
  const picks = [];
  for (const t of call('search_treks', { maxDays: p.days, fitness: p.fitness })) {
    const s = call('check_season', { trekId: t.id, month: p.month });
    const b = call('estimate_budget', { trekId: t.id, travelers: p.travelers });
    if (s.status === 'avoid') continue;
    const withinBudget = b.total <= p.budget;
    picks.push({ ...t, season: s.status, total: b.total, withinBudget, score: (s.status === 'best' ? 2 : 1) + (withinBudget ? 2 : 0) });
  }
  picks.sort((a, b) => b.score - a.score || a.total - b.total);
  const summary = picks.length
    ? `Top match: ${picks[0].name}. ${picks[0].withinBudget ? 'It fits your budget.' : 'It is over budget, so consider fewer people or a cheaper trek.'}`
    : 'No trek fits those limits for that month. Try more days, a different month or a higher fitness level.';
  return { mode: 'rules', note, summary, picks: picks.slice(0, 3), trace };
}

async function viaModel(p) {
  const trace = [];
  const messages = [
    { role: 'system', content: 'You plan treks in Karnataka. Get every fact (trek details, season, cost) from the tools and never invent numbers. Recommend up to 3 treks, explain trade-offs briefly, and give a short itinerary for the best one.' },
    { role: 'user', content: JSON.stringify(p) }
  ];
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openrouter/free', messages, tools: toolSchemas })
    });
    if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
    const msg = (await res.json()).choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) return { mode: 'ai', summary: msg.content, picks: [], trace };
    for (const c of msg.tool_calls) {
      const args = JSON.parse(c.function.arguments || '{}');
      const result = toolFns[c.function.name] ? toolFns[c.function.name](args) : { error: 'Unknown tool' };
      trace.push({ tool: c.function.name, args, result });
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('Planner did not finish');
}

export async function runPlanner(input = {}) {
  const p = {
    days: Number(input.days) || 2,
    fitness: ['low', 'medium', 'high'].includes(input.fitness) ? input.fitness : 'medium',
    budget: Number(input.budget) || 5000,
    month: Math.min(12, Math.max(1, Number(input.month) || new Date().getMonth() + 1)),
    travelers: Math.min(20, Math.max(1, Number(input.travelers) || 1)),
    notes: String(input.notes || '').slice(0, 500)
  };
  if (!process.env.OPENROUTER_API_KEY) return rules(p);
  try { return await viaModel(p); }
  catch (e) { return rules(p, `AI planner unavailable (${e.message}); showing rule-based results.`); }
}
