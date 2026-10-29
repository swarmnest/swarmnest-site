import { SKILL_MD } from '../lib/field-reports-doc';
export const GET = () => new Response(SKILL_MD, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
