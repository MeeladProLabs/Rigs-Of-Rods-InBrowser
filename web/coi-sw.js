/* coi-sw.js
 *
 * Cross-Origin-Isolation service worker for hosts that cannot send
 * COOP/COEP headers (e.g. GitHub Pages).
 *
 * The threaded (pthreads) wasm build needs SharedArrayBuffer, which the
 * browser only exposes on a cross-origin-isolated page. This service worker
 * intercepts navigation requests and injects:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: credentialless
 *
 * COEP "credentialless" is used (instead of require-corp) so cross-origin
 * fetches made by the game (mod repository API, etc.) keep working.
 *
 * index.html registers this worker; on the very first visit the page reloads
 * once so the isolation headers take effect before the game boots.
 *
 * Based on the well-known "coi-serviceworker" technique
 * (https://github.com/gzuidhof/coi-serviceworker).
 */
let coepCredentialless = true;

if (typeof window === "undefined") {
  /* -------- worker context -------- */
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", function (event) {
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
      return;
    }
    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request).then((response) => {
          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          newHeaders.set(
            "Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
          );
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
      );
    }
  });
} else {
  /* -------- page context -------- */
  (async function () {
    if (window.crossOriginIsolated !== true) {
      let needReload = false;
      try {
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("coi-sw.js", {
            scope: "./",
            updateViaCache: "none",
          });
          if (navigator.serviceWorker.controller) {
            // A worker is controlling the page but isolation is off
            // (stale worker / first visit): reload to pick up headers.
            needReload = true;
          } else {
            // Fresh registration: wait for activation + claim, then reload.
            await new Promise((resolve) => {
              const t = setTimeout(resolve, 1500); // safety timeout
              navigator.serviceWorker.addEventListener("controllerchange", () => {
                clearTimeout(t);
                resolve();
              });
            });
            needReload = true;
          }
        }
      } catch (e) {
        console.warn("coi-sw registration failed:", e);
      }
      if (needReload) {
        // Guard against reload loops: only reload once per tab session.
        const key = "coi_reloaded";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          location.reload();
        }
      }
    }
  })();
}
