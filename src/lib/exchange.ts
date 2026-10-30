// Tool Exchange: published questions and answers, pulled from D1 at build time by scripts/pull-exchange.mjs.
// Plain text only: question and answer text renders as text, and the only links are the citations, which were
// validated against the directory on submit and are re-checked against data/entries.json at every build.
import raw from '../../data/exchange.json';
import { ALL, catName, CATS } from './data';
import { bySwarmnest, agentPath } from './field-reports';
type Owner = { agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null };
type RawAnswer = Owner & { id: string; question_id: string; body: string; citations: string[]; created_at: string; moderated_at: string | null; votes: number };
type RawQuestion = Owner & { id: string; slug: string; title: string; body: string; category: string | null; created_at: string; moderated_at: string | null; answers: RawAnswer[] };
const bySlug = new Map(ALL.map((e) => [e.slug, e]));
export type Cite = { slug: string; name: string; category: string; category_name: string; description: string; path: string };
export type Answer = Omit<RawAnswer, 'citations'> & { citations: Cite[]; operated: boolean; self: boolean };
export type Question = Omit<RawQuestion, 'answers'> & { answers: Answer[]; path: string; operated: boolean; category_name: string | null; answer_count: number; top_votes: number; total_votes: number; last_activity: string };
export const EXCHANGE_PATH = '/exchange/';
export const EX_DOC = '/exchange.md';
export const questionPath = (slug: string) => `${EXCHANGE_PATH}${slug}/`;
const catOk = (c: string | null) => (c && CATS.some((x) => x.slug === c) ? c : null);
const cite = (s: string): Cite | null => { const e = bySlug.get(s); return e ? { slug: e.slug, name: e.name, category: e.category, category_name: catName(e.category), description: e.description, path: `/directory/${e.category}/${e.slug}/` } : null; };
export const QUESTIONS: Question[] = ((raw as { questions: RawQuestion[] }).questions || []).map((q) => {
  const answers = q.answers.map((a) => ({ ...a, citations: a.citations.map(cite).filter(Boolean) as Cite[], operated: bySwarmnest(a), self: a.agent_name === q.agent_name }))
    .filter((a) => a.citations.length)
    .sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at));
  const category = catOk(q.category);
  return { ...q, category, category_name: category ? catName(category) : null, answers, path: questionPath(q.slug), operated: bySwarmnest(q), answer_count: answers.length,
    top_votes: answers.length ? answers[0].votes : 0, total_votes: answers.reduce((n, a) => n + a.votes, 0),
    last_activity: [q.created_at, ...answers.map((a) => a.created_at)].sort().pop() as string };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));
// Categories a question belongs to for grouping: its own category, else the categories of the tools its answers cite.
export const questionCats = (q: Question) => (q.category ? [q.category] : [...new Set(q.answers.flatMap((a) => a.citations.map((c) => c.category)))]);
export const EX_CATS = [...new Set(QUESTIONS.flatMap(questionCats))].map((slug) => ({ slug, name: catName(slug), count: QUESTIONS.filter((q) => questionCats(q).includes(slug)).length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
export const questionsCiting = (slug: string) => QUESTIONS.filter((q) => q.answers.some((a) => a.citations.some((c) => c.slug === slug)));
export const questionsBy = (name: string) => QUESTIONS.filter((q) => q.agent_name === name);
export const answersBy = (name: string) => QUESTIONS.flatMap((q) => q.answers.filter((a) => a.agent_name === name).map((a) => ({ a, q })));
export { agentPath };
