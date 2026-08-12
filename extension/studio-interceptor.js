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

  // --- Detección automática del handle (paso "a" de la cascada a/b/c) ---------------------
  // Además de item_list, cualquier respuesta JSON de la API puede traer el @usuario del dueño
  // de la cuenta (unique_id/uniqueId/username, sueltos o adentro de un objeto user/author).
  // Publicamos lo que encontremos con un tipo de mensaje distinto para no mezclarlo con los
  // videos. Muy conservador a propósito: solo strings cortos con forma de handle, nunca IDs
  // numéricos ni texto libre.
  var lastPublishedHandle = null;

  function isPlausibleHandle(value) {
    // Requiere al menos una letra para no confundir un item_id / user_id puramente numérico
    // (que también pasaría por unique_id-like keys en algunas respuestas) con un handle real.
    return typeof value === 'string' && /^(?=.*[a-zA-Z])[a-zA-Z0-9_.]{2,24}$/.test(value);
  }

  // Recorrido acotado (budget de nodos visitados) para no cargar la página si algún día una
  // respuesta JSON es enorme. Nunca lanza: cualquier forma inesperada simplemente no encuentra nada.
  function findHandleInObject(obj, budget) {
    if (!obj || typeof obj !== 'object' || budget.count <= 0) return null;
    budget.count--;

    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length && i < 20; i++) {
        var foundInArray = findHandleInObject(obj[i], budget);
        if (foundInArray) return foundInArray;
        if (budget.count <= 0) return null;
      }
      return null;
    }

    var directKeys = ['unique_id', 'uniqueId', 'username'];
    for (var k = 0; k < directKeys.length; k++) {
      if (isPlausibleHandle(obj[directKeys[k]])) return obj[directKeys[k]];
    }

    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      var val = obj[key];
      if (val && typeof val === 'object') {
        var found = findHandleInObject(val, budget);
        if (found) return found;
      }
      if (budget.count <= 0) return null;
    }
    return null;
  }

  function publishUser(handle) {
    try {
      if (!handle || handle === lastPublishedHandle) return;
      lastPublishedHandle = handle;
      // Se guarda también como atributo del DOM (compartido entre el mundo MAIN y el aislado)
      // para que studio-content.js lo pueda leer al iniciar aunque su listener de postMessage
      // todavía no estuviera activo cuando esta respuesta llegó.
      document.documentElement.setAttribute('data-ttchop-handle', handle);
      window.postMessage({ source: 'ttchop-studio-user', payload: { handle: handle } }, '*');
    } catch (e) {
      // no-op
    }
  }

  function isJsonResponse(contentType) {
    return typeof contentType === 'string' && contentType.indexOf('application/json') !== -1;
  }

  function handleIntercepted(url, data) {
    try {
      if (typeof url === 'string' && url.indexOf(TARGET) !== -1) publish(data);
      var handle = findHandleInObject(data, { count: 400 });
      if (handle) publishUser(handle);
    } catch (e) {
      // no-op
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
          promise
            .then(function (response) {
              try {
                var contentType = response.headers && response.headers.get && response.headers.get('content-type');
                if (!isJsonResponse(contentType)) return;
                // .clone() es clave: nunca leemos el body que recibe TikTok,
                // leemos una copia. La respuesta original sigue intacta.
                response
                  .clone()
                  .json()
                  .then(function (data) {
                    handleIntercepted(url, data);
                  })
                  .catch(function () {});
              } catch (e) {
                // no-op
              }
            })
            .catch(function () {});
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
          this.addEventListener('load', function () {
            try {
              var contentType = this.getResponseHeader && this.getResponseHeader('content-type');
              if (!isJsonResponse(contentType)) return;
              var data = JSON.parse(this.responseText);
              handleIntercepted(url, data);
            } catch (e) {
              // Respuesta no era JSON o forma inesperada: se ignora.
            }
          });
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
