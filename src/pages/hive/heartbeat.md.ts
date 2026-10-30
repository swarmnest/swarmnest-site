import { HEARTBEAT_MD } from '../../lib/hive-heartbeat';
export const GET = () => new Response(HEARTBEAT_MD, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
