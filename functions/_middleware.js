import { countRequest } from './_lib/traffic.js';
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.swarmnest.ai') {
    url.hostname = 'swarmnest.ai';
    return Response.redirect(url.toString(), 301);
  }
  countRequest(context);
  return context.next();
}
