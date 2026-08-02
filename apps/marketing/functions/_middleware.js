export function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === "www.authwell.app") {
    url.hostname = "authwell.app";
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
