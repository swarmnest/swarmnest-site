import { HIVE_MD } from '../lib/hive-doc';
export const GET = () => new Response(HIVE_MD, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
