// Corre en el "MAIN world" (el contexto real de la página, no el aislado de la
// extensión) para poder parchear window.fetch y XMLHttpRequest de TikTok.
// Objetivo: leer la respuesta de item_list AL VUELO, sin tocarla ni retrasarla,
// y avisarle al content script aislado por window.postMessage.
//
// Regla de oro: si algo de esto falla, TikTok Studio tiene que seguir
// funcionando exactamente igual. Por eso cada parche está envuelto en su
// propio try/catch y siempre delega en la función original.
(function () {
  var TARGET = '/creator/manage/item_list';

  function publish(data) {
    try {
      window.postMessage({ source: 'ttchop-studio', payload: data }, '*');
    } catch (e) {
      // Nunca romper la página por esto.
    }
  }

  // --- fetch ---
  try {
    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (...args) {
        var promise = originalFetch.apply(this, args);
        try {
          var input = args[0];
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (typeof url === 'string' && url.indexOf(TARGET) !== -1) {
            promise
              .then(function (response) {
                try {
                  // .clone() es clave: nunca leemos el body que recibe TikTok,
                  // leemos una copia. La respuesta original sigue intacta.
                  response
                    .clone()
                    .json()
                    .then(publish)
                    .catch(function () {});
                } catch (e) {
                  // no-op
                }
              })
              .catch(function () {});
          }
        } catch (e) {
          // no-op: la petición real ya salió con originalFetch, no se afecta.
        }
        return promise;
      };
    }
  } catch (e) {
    // no-op
  }

  // --- XMLHttpRequest ---
  try {
    var OriginalXHR = window.XMLHttpRequest;
    if (OriginalXHR && OriginalXHR.prototype) {
      var originalOpen = OriginalXHR.prototype.open;
      var originalSend = OriginalXHR.prototype.send;

      OriginalXHR.prototype.open = function (method, url) {
        try {
          this.__ttchopUrl = url;
        } catch (e) {
          // no-op
        }
        return originalOpen.apply(this, arguments);
      };

      OriginalXHR.prototype.send = function () {
        try {
          var url = this.__ttchopUrl;
          if (typeof url === 'string' && url.indexOf(TARGET) !== -1) {
            this.addEventListener('load', function () {
              try {
                publish(JSON.parse(this.responseText));
              } catch (e) {
                // Respuesta no era JSON o forma inesperada: se ignora.
              }
            });
          }
        } catch (e) {
          // no-op
        }
        return originalSend.apply(this, arguments);
      };
    }
  } catch (e) {
    // no-op
  }
})();
