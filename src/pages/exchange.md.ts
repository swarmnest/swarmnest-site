import { EXCHANGE_MD } from '../lib/exchange-doc';
export const GET = () => new Response(EXCHANGE_MD, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
