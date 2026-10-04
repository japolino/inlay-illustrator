// node_modules/preact/dist/preact.mjs
var n;
var t;
var i;
var r;
var u;
var f;
var o;
var e;
var l;
var c;
var a;
var s;
var h;
var p;
var v = {};
var y = [];
var w = /^m(i|n|o|s|text|space)$/;
var d = Array.isArray;
var _ = y.slice;
var g = Object.assign;
function b(n) {
  n && n.parentNode && n.remove();
}
function M(i, r, u, f, o) {
  var e = { type: i, props: r, key: u, ref: f, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: undefined, __v: o || ++t, __i: -1, __u: 0 };
  return !o && n.vnode && n.vnode(e), e;
}
function x(n) {
  return n.children;
}
function S(n, t) {
  this.props = n, this.context = t, this.__g = 0;
}
function C(n, t) {
  if (t == null)
    return n.__ ? C(n.__, n.__i + 1) : null;
  for (var i;t < n.__k.length; t++)
    if ((i = n.__k[t]) && i.__e)
      return i.__e;
  return typeof n.type != "function" || n.props.__P ? null : C(n);
}
function j(n) {
  if ((n = n.__) && n.__c && !n.props.__P)
    return n.__e = null, n.__k.some(function(t) {
      return t && (n.__e = t.__e);
    }), j(n);
}
function L(t) {
  (8 & t.__g || !(t.__g |= 8) || !r.push(t) || f++) && u == n.debounceRendering || ((u = n.debounceRendering) || queueMicrotask)(H);
}
function H() {
  var t, i, u, e, l, c, a, s, h;
  try {
    for (i = 1;r.length; )
      r.length > i && r.sort(o), t = r.shift(), i = r.length, 8 & t.__g && (e = undefined, l = undefined, c = (l = (u = t).__v).__e, a = [], s = [], (h = u.__P) && ((e = g({ constructor: undefined }, l)).__v = l.__v + 1, n.vnode && n.vnode(e), z(h, e, l, u.__n, h.namespaceURI, 32 & l.__u ? [c] : null, a, c || C(l), 32 & l.__u, s), e.__v = l.__v, e.__.__k[e.__i] = e, D(a, e, s), l.__ = l.__e = null, e.__e != c && j(e)));
  } finally {
    r.length = f = 0;
  }
}
function I(n, t, i, r, u, f, o, e, l, c, a) {
  var s, h, p, w, d, _, g = r.__k || y, b = t.length;
  for (l = A(i, t, g, l, b), s = 0;s < b; s++)
    (p = i.__k[s]) != null && (h = ~p.__i && g[p.__i] || v, p.__i = s, _ = z(n, p, h, u, f, o, e, l, c, a), w = p.__e, p.ref && (h.ref != p.ref || 8 & h.__u) && (h.ref != p.ref && h.ref && F(h.ref, null, p), a.push(p.ref, p.__c || w, p)), d = d || w, 4 & p.__u ? (l = O(p, l, n, !h.__v), h.__e && (h.__e = null)) : typeof p.type == "function" && _ !== undefined ? l = _ : w && (l = w.nextSibling), p.__u &= -7);
  return i.__e = d, l;
}
function A(n, t, i, r, u) {
  var f, o, e, l, c, a, s, h, p, v, y = i.length, w = y, _ = 0, g = false, b = n.__k = Array(u);
  for (f = 0;f < u; f++)
    (o = t[f]) != null && typeof o != "boolean" && typeof o != "function" ? (typeof o != "object" || o.constructor == String ? o = b[f] = M(null, o) : d(o) ? o = b[f] = M(x, { children: o }) : o.constructor === undefined && o.__b ? o = b[f] = M(o.type, o.props, o.key, o.ref, o.__v) : b[f] = o, l = f + _, o.__ = n, o.__b = n.__b + 1, e = null, ~(c = o.__i = T(o, i, l, w)) && (w--, (e = i[c]) && (e.__u |= 2)), e && e.__v ? (o.__u |= 2, c == l - 1 ? _-- : c == l + 1 ? _++ : c != l && (c > l ? _-- : _++, g = true)) : (~c || (u > y ? _-- : u < y && _++), typeof o.type != "function" && (o.__u |= 4))) : b[f] = null;
  if (g) {
    for (a = [], s = [], f = 0;f < u; f++)
      if ((o = b[f]) && 2 & o.__u) {
        for (h = 0, p = a.length;h < p; )
          a[v = h + p >> 1] < o.__i ? h = v + 1 : p = v;
        a[h] = o.__i, s[f] = h + 1;
      }
    for (_ = a.length;f--; )
      s[f] && (s[f] == _ ? _-- : b[f].__u |= 4);
  }
  if (w)
    for (f = 0;f < y; f++)
      !(e = i[f]) || 2 & e.__u || (e.__e == r && (r = C(e)), G(e, e));
  return r;
}
function O(n, t, i, r) {
  var u, f;
  if (typeof n.type == "function") {
    if (n.props.__P)
      return t;
    if (u = n.__k)
      for (f = 0;f < u.length; f++)
        u[f] && (u[f].__ = n, t = O(u[f], t, i, false));
    return t;
  }
  for (t && !t.parentNode && (t = C(n)) && !t.parentNode && (t = null), n.__e != t && (!r && i.moveBefore && n.__e.parentNode ? i.moveBefore(n.__e, t) : i.insertBefore(n.__e, t || null)), t = n.__e;(t = t && t.nextSibling) && t.nodeType == 8; )
    ;
  return t;
}
function T(n, t, i, r) {
  var u, f, o, { key: e, type: l } = n, c = t[i], a = c && !(2 & c.__u);
  if (c === null && e == null || a && e == c.key && l == c.type)
    return i;
  if (r > (a ? 1 : 0)) {
    for (u = i - 1, f = i + 1;u >= 0 || f < t.length; )
      if ((c = t[o = u >= 0 ? u-- : f++]) && !(2 & c.__u) && e == c.key && l == c.type)
        return o;
  }
  return -1;
}
function q(n, t, i) {
  i == null && (i = ""), t[0] == "-" ? n.setProperty(t, i) : n[t] = i;
}
function N(n, t, i, r, u) {
  var f;
  n:
    if (t == "style")
      if (typeof i == "string")
        n.style.cssText = i;
      else {
        if (typeof r == "string" && (n.style.cssText = r = ""), r)
          for (t in r)
            i && t in i || q(n.style, t, "");
        if (i)
          for (t in i)
            r && i[t] == r[t] || q(n.style, t, i[t]);
      }
    else if (t[0] == "o" && t[1] == "n")
      f = t != (t = t.replace(c, "$1")), (t = t.slice(2))[0] < "a" && (t = t.toLowerCase()), (n.__e || (n.__e = {}))[t + f] = i, i ? r ? i[l] = r[l] : (i[l] = a, n.addEventListener(t, f ? h : s, f)) : n.removeEventListener(t, f ? h : s, f);
    else {
      if (u == "http://www.w3.org/2000/svg")
        t = t.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if (t != "width" && t != "height" && t != "href" && t != "list" && t != "form" && t != "tabIndex" && t != "download" && t != "rowSpan" && t != "colSpan" && t != "role" && t != "popover" && t in n)
        try {
          n[t] = i == null ? "" : i;
          break n;
        } catch (n) {}
      typeof i == "function" || (i == null || i === false && t[4] != "-" ? n.removeAttribute(t) : n.setAttribute(t, t == "popover" && i == 1 ? "" : i));
    }
}
function V(t) {
  return function(i) {
    if (this.__e) {
      var r = this.__e[i.type + t];
      if (i[e] == null)
        i[e] = a++;
      else if (i[e] < r[l])
        return;
      return r(n.event ? n.event(i) : i);
    }
  };
}
function z(t, i, r, u, f, o, e, l, c, a) {
  var s, h, p, v, w, _, k, m, M, $, j, L, H, A, O, P, T, q, N, V, z = i.type;
  if (i.constructor !== undefined)
    return null;
  if (128 & r.__u && (c = 32 & r.__u, s = r.__c.__z)) {
    if (i.__u |= c, h = o = [], s.nodeType == 8)
      for (p = 1, v = s.nextSibling;v; v = v.nextSibling) {
        if (v.nodeType == 8) {
          if (v.data.startsWith("$s"))
            p++;
          else if (v.data.startsWith("/$s") && !--p)
            break;
        }
        o.push(v);
      }
    else
      o.push(s);
    l = o[0];
  }
  (s = n.__b) && s(i);
  n:
    if (typeof z == "function") {
      w = e.length;
      try {
        if ($ = i.props, j = (s = z.prototype) && s.render, L = (s = z.contextType) && u[s.__c], H = s ? L ? L.props.value : s.__ : u, r.__c ? 2 & (_ = i.__c = r.__c).__g && (_.__g |= 1) : (j ? i.__c = _ = new z($, H) : (i.__c = _ = new S($, H), _.constructor = z, _.render = J), L && L.sub(_), _.state || (_.state = {}), _.__n = u, _.__g |= 8, _.__h = [], _.__k = []), j && (_.__s || (_.__s = _.state), z.getDerivedStateFromProps && (_.__s == _.state && (_.__s = g({}, _.__s)), g(_.__s, z.getDerivedStateFromProps($, _.__s)))), k = _.props, m = _.state, _.__v = i, r.__c) {
          if (j && !z.getDerivedStateFromProps && $ !== k && _.componentWillReceiveProps && _.componentWillReceiveProps($, H), i.__v == r.__v && !(8 & _.__g) || !(4 & _.__g) && _.shouldComponentUpdate && _.shouldComponentUpdate($, _.__s, H) === false) {
            i.__v != r.__v && (_.props = $, _.state = _.__s, _.__g &= -9), i.__e = r.__e, i.__k = r.__k, i.__k.some(function(n) {
              n && (n.__ = i);
            }), y.push.apply(_.__h, _.__k), _.__k = [], _.__h.length && e.push(_), l = C(r);
            break n;
          }
          _.componentWillUpdate && _.componentWillUpdate($, _.__s, H), j && _.componentDidUpdate && _.__h.push(function() {
            _.componentDidUpdate(k, m, M);
          });
        } else
          j && !z.getDerivedStateFromProps && _.componentWillMount && _.componentWillMount(), j && _.componentDidMount && _.__h.push(_.componentDidMount);
        if (_.context = H, _.props = $, _.__P = t, _.__g &= -5, A = n.__r, O = 0, j)
          _.state = _.__s, _.__g &= -9, A && A(i), s = _.render(_.props, _.state, _.context), y.push.apply(_.__h, _.__k), _.__k = [];
        else
          do {
            _.__g &= -9, A && A(i), s = _.render(_.props, _.state, _.context), _.state = _.__s;
          } while (8 & _.__g && ++O < 25);
        _.state = _.__s, _.getChildContext && (u = g({}, u, _.getChildContext())), j && r.__c && _.getSnapshotBeforeUpdate && (M = _.getSnapshotBeforeUpdate(k, m)), P = s && s.type === x && s.key == null ? s.props.children : s, $.__P && (s = l, f = (t = $.__P).namespaceURI, c = o = null, r.props && r.props.__P != t && (r.__k.some(function(n) {
          n && G(n, n);
        }), r.__k = null), l = r.__k ? C(r, 0) : null), l = I(t, d(P) ? P : [P], i, r, u, f, o, e, l, c, a), $.__P && (i.__e = null, l = s), i.__u &= -161, 128 & r.__u && (_.__z = null), h && h.some(b), _.__h.length && e.push(_), 1 & _.__g && (_.__g &= -4);
      } catch (t) {
        if (e.length = w, i.__v = null, c || o)
          if (t.then) {
            if (T = 0, i.__u |= c ? 160 : 128, o) {
              for (N = 0;N < o.length; N++)
                if (V = o[N])
                  if (V.nodeType == 8) {
                    if (o[N] = null, V.data.startsWith("$s"))
                      T++ || (q = V);
                    else if (V.data.startsWith("/$s") && !--T) {
                      l = V;
                      break;
                    }
                  } else
                    T && (o[N] = null);
            }
            if (!q) {
              for (;l && l.nodeType == 8 && l.nextSibling; )
                l = l.nextSibling;
              o && (o[o.indexOf(l)] = null), q = l;
            }
            i.__c.__z || (i.__c.__z = q), i.__e = l;
          } else
            o && o.some(b);
        else
          i.__e = r.__e;
        i.__k || (i.__k = r.__k || []), t.then || B(i), n.__e(t, i, r);
      }
    } else
      l = i.__e = E(r.__e, i, r, u, f, o, e, c, a, t);
  return (s = n.diffed) && s(i), 128 & i.__u ? undefined : l;
}
function B(n) {
  n && (n.__c && (n.__c.__g |= 4), n.__k && n.__k.some(B));
}
function D(t, i, r) {
  for (var u = 0;u < r.length; )
    F(r[u++], r[u++], r[u++]);
  n.__c && n.__c(i, t), t.some(function(i) {
    try {
      t = i.__h, i.__h = [], t.some(function(n) {
        n.call(i);
      });
    } catch (t) {
      n.__e(t, i.__v);
    }
  });
}
function E(t, i, r, u, f, o, e, l, c, a) {
  var s, h, p, y, g, k, m, M, $, x = r.props || v, { props: S, type: j } = i;
  if (j == "svg" ? f = "http://www.w3.org/2000/svg" : j == "math" ? f = "http://www.w3.org/1998/Math/MathML" : f || (f = "http://www.w3.org/1999/xhtml"), o) {
    for (s = 0;s < o.length; s++)
      if ((g = o[s]) && (j ? g.localName == j : g.nodeType == 3)) {
        t = g, o[s] = null;
        break;
      }
  }
  if (!t) {
    if (M = a.ownerDocument || document, !j)
      return M.createTextNode(S);
    t = M.createElementNS(f, j, S.is && S), l && (n.__m && n.__m(i, o), l = false), o = null;
  }
  if (j) {
    if (a = j == "template" ? t.content : t, o = j == "textarea" && S.defaultValue != null ? null : o && _.call(a.childNodes), !l && o)
      for (x = {}, s = 0;s < t.attributes.length; s++)
        x[(g = t.attributes[s]).name] = g.value;
    for (s in x)
      g = x[s], s == "dangerouslySetInnerHTML" ? p = g : s == "children" || (s in S) || s == "value" && ("defaultValue" in S) || s == "checked" && ("defaultChecked" in S) || N(t, s, null, g, f);
    for (s in $ = 1 & r.__u, S)
      g = S[s], s == "children" ? y = g : s == "dangerouslySetInnerHTML" ? h = g : s == "value" ? k = g : s == "checked" ? m = g : l && typeof g != "function" || !(x[s] !== g || $ && g != null) || N(t, s, g, x[s], f);
    h ? (l || p && (h.__html == p.__html || h.__html == t.innerHTML) || (t.innerHTML = h.__html), i.__k = []) : (p && (t.textContent = ""), (j == "foreignObject" || f == "http://www.w3.org/1998/Math/MathML" && w.test(j)) && (f = "http://www.w3.org/1999/xhtml"), I(a, d(y) ? y : [y], i, r, u, f, o, e, o ? o[0] : r.__k && C(r, 0), l, c), o && o.some(b)), l && j != "textarea" || (s = "value", j == "progress" && k == null ? t.removeAttribute(s) : k == null || k === t[s] && (j != "progress" || k) || N(t, s, k, x[s], f), s = "checked", m != null && m != t[s] && N(t, s, m, x[s], f));
  } else
    x === S || l && t.data == S || (t.data = S);
  return t;
}
function F(t, i, r) {
  try {
    typeof t == "function" ? (typeof t.__u == "function" && t.__u(), (typeof t.__u != "function" || i) && (t.__u = t(i))) : t.current = i;
  } catch (t) {
    n.__e(t, r);
  }
}
function G(t, i, r) {
  var u, f;
  if (n.unmount && n.unmount(t), !(u = t.ref) || u.current && u.current != t.__e || F(u, null, i), u = t.__c) {
    if (u.componentWillUnmount)
      try {
        u.componentWillUnmount();
      } catch (t) {
        n.__e(t, i);
      }
    u.__P = u.__n = null;
  }
  if (u = t.__k)
    for (f = 0;f < u.length; f++)
      u[f] && G(u[f], i, typeof t.type != "function" || r && !t.props.__P);
  (u = t.__e) && (r || b(u), u.__e && (u.__e = null)), t.__e = t.__c = t.__ = null;
}
function J(n, t, i) {
  return this.constructor(n, i);
}
function K(t, i) {
  var r, u, f, o;
  n.__ && n.__(t, i), i.nodeType == 9 && (i = i.documentElement), u = (r = t && 32 & t.__u) ? null : i.__k, i.__k = M(x, { children: [t] }), f = [], o = [], z(i, i.__k, u || v, v, i.namespaceURI, u ? null : i.firstChild ? _.call(i.childNodes) : null, f, u ? u.__e : i.firstChild, r, o), D(f, i.__k, o), i.__k.props.children = null;
}
function R(n) {
  function t(n) {
    var i, r;
    return this.getChildContext || (i = new Set, (r = {})[t.__c] = this, this.getChildContext = function() {
      return r;
    }, this.shouldComponentUpdate = function(n) {
      this.props.value != n.value && i.forEach(function(n) {
        n.__g |= 4, L(n);
      });
    }, this.sub = function(n) {
      i.add(n);
      var t = n.componentWillUnmount;
      n.componentWillUnmount = function() {
        i.delete(n), t && t.call(n);
      };
    }), n.children;
  }
  return t.__c = "__cC" + p++, t.__ = n, t.Provider = (t.Consumer = function(n, t) {
    return n.children(t);
  }).contextType = t, t;
}
function U(n) {
  return n.children;
}
function W(n, t) {
  return M(U, { __P: t, children: n });
}
n = { __e: function(n, t, i, r) {
  for (var u, o, e;t = t.__; )
    if ((u = t.__c) && !(1 & u.__g)) {
      u.__g |= 4;
      try {
        if ((o = u.constructor) && o.getDerivedStateFromError && (u.setState(o.getDerivedStateFromError(n)), e = 8 & u.__g), u.componentDidCatch && (u.componentDidCatch(n, r || {}), e = 8 & u.__g), e)
          return void (u.__g |= 2);
      } catch (t) {
        n = t, e = 0;
      }
    }
  throw f = 0, n;
} }, t = 0, i = function(n) {
  return n != null && n.constructor === undefined;
}, S.prototype.setState = function(n, t) {
  var i = this.__s;
  i && i != this.state || (i = this.__s = g({}, this.state)), typeof n == "function" && (n = n(g({}, i), this.props)), n && (g(i, n), this.__v && (t && this.__k.push(t), L(this)));
}, S.prototype.forceUpdate = function(n) {
  this.__v && (this.__g |= 4, n && this.__h.push(n), L(this));
}, S.prototype.render = x, r = [], f = 0, o = function(n, t) {
  return n.__v.__b - t.__v.__b;
}, e = Symbol(), l = Symbol(), c = /(PointerCapture)$|Capture$/i, a = 0, s = V(false), h = V(true), p = 0;

// src/frontend/avatar-image.ts
var MAX_AVATAR_BYTES = 8000000;
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let offset = 0;offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
async function respondToAvatarImageRequest(message, sendToBackend, fetchFn = fetch) {
  const requestId = String(message.requestId || "");
  const imageUrl = String(message.imageUrl || "");
  const chatId = String(message.chatId || "");
  const respond = (payload) => sendToBackend({
    type: "avatar_image_response",
    requestId,
    chatId,
    ...payload
  });
  if (!requestId || !/^\/api\/v1\/images\//.test(imageUrl)) {
    respond({ error: "Invalid avatar image request." });
    return;
  }
  try {
    const response = await fetchFn(imageUrl, { credentials: "include", headers: { Accept: "image/*" } });
    if (!response.ok)
      throw new Error(`Avatar fetch failed (${response.status}).`);
    const blob = await response.blob();
    const mimeType = String(blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType))
      throw new Error("Avatar response was not a supported image.");
    if (blob.size <= 0 || blob.size > MAX_AVATAR_BYTES)
      throw new Error("Avatar image is empty or too large.");
    const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    respond({ data, mimeType });
  } catch (error) {
    respond({ error: error instanceof Error ? error.message.slice(0, 300) : "Avatar fetch failed." });
  }
}

// src/frontend/api.ts
var JSON_HEADERS = { Accept: "application/json" };
async function fetchParserConnections() {
  try {
    const response = await fetch("/api/v1/connections?limit=100&offset=0", { headers: JSON_HEADERS });
    if (!response.ok)
      return [];
    const result = await response.json();
    const rows = Array.isArray(result) ? result : result.data || [];
    return rows.map((connection) => ({
      id: String(connection.id || ""),
      name: String(connection.name || ""),
      provider: String(connection.provider || ""),
      model: String(connection.model || "")
    })).filter((connection) => connection.id);
  } catch {
    return [];
  }
}

// src/shared/config.ts
var INLAY_IMAGE_ASPECT_PRESETS = [
  { value: "auto", label: "Auto (Image ratio)" },
  { value: "wide", label: "Wide 16:9" },
  { value: "standard", label: "Standard 4:3" },
  { value: "square", label: "Square 1:1" },
  { value: "portrait", label: "Portrait 3:4" },
  { value: "vertical", label: "Vertical 9:16" },
  { value: "classic", label: "Classic 2:3" }
];
var INLAY_IMAGE_ASPECT_RATIOS = {
  wide: { w: 16, h: 9 },
  standard: { w: 4, h: 3 },
  square: { w: 1, h: 1 },
  portrait: { w: 3, h: 4 },
  vertical: { w: 9, h: 16 },
  classic: { w: 2, h: 3 }
};
function positiveDimension(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
function resolveInlayImageAspect(value, intrinsicDimensions) {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto" || !key) {
    const w = positiveDimension(intrinsicDimensions?.width);
    const h = positiveDimension(intrinsicDimensions?.height);
    if (w && h)
      return { w, h };
    return INLAY_IMAGE_ASPECT_RATIOS.wide;
  }
  return INLAY_IMAGE_ASPECT_RATIOS[key] ?? INLAY_IMAGE_ASPECT_RATIOS.wide;
}
function normalizeInlayImageAspect(value) {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto")
    return "auto";
  return key in INLAY_IMAGE_ASPECT_RATIOS ? key : "auto";
}
var FAB_CORNER_OPTIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" }
];
function normalizeFabCorner(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bottom-left" || normalized === "top-right" || normalized === "top-left") {
    return normalized;
  }
  return "bottom-right";
}
var DEFAULT_CONFIG = {
  enabled: true,
  debugLogging: false,
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  parserMaxTokens: 0,
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  imageAlignment: "center",
  inlayImageAspect: "auto",
  inlayImageMaxHeightVh: 70,
  coverImagePosition: "top",
  coverImageAspect: "wide",
  coverImageWidth: 1200,
  coverImageMaxHeightVh: 80,
  fabCorner: "bottom-right"
};
function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanNullableString(value) {
  return cleanString(value) || null;
}
function cleanParameters(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function normalizeConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const legacy = source.imageGeneration || {};
  const parserParameters = cleanParameters(source.parserParameters);
  const imageParameters = cleanParameters(source.imageParameters);
  return {
    enabled: source.enabled !== false,
    debugLogging: source.debugLogging === true,
    parserConnectionId: cleanNullableString(source.parserConnectionId) || cleanNullableString(legacy.promptParserConnectionId),
    parserModel: cleanString(source.parserModel) || cleanString(legacy.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(legacy.promptParserParameters),
    parserMaxTokens: clampInt(source.parserMaxTokens, 0, 131072, DEFAULT_CONFIG.parserMaxTokens),
    imageConnectionId: cleanNullableString(source.imageConnectionId) || cleanNullableString(legacy.activeImageGenConnectionId),
    imageModel: cleanString(source.imageModel) || cleanString(legacy.model),
    imageParameters: Object.keys(imageParameters).length > 0 ? imageParameters : cleanParameters(legacy.parameters),
    imageAlignment: source.imageAlignment === "left" ? "left" : "center",
    inlayImageAspect: normalizeInlayImageAspect(source.inlayImageAspect),
    inlayImageMaxHeightVh: clampInt(source.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    coverImagePosition: source.coverImagePosition === "bottom" ? "bottom" : "top",
    coverImageAspect: source.coverImageAspect === undefined ? "wide" : normalizeInlayImageAspect(source.coverImageAspect),
    coverImageWidth: clampInt(source.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth),
    coverImageMaxHeightVh: clampInt(source.coverImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.coverImageMaxHeightVh),
    fabCorner: normalizeFabCorner(source.fabCorner)
  };
}

// src/shared/inlay-frame.ts
function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function positiveDimension2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
function inlayFrameGeometry(imageParameters, placement, config) {
  const maxHeight = clampInteger(placement === "cover" ? config.coverImageMaxHeightVh : config.inlayImageMaxHeightVh, 10, 100, placement === "cover" ? DEFAULT_CONFIG.coverImageMaxHeightVh : DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const parameters = imageParameters && Object.keys(imageParameters).length > 0 ? imageParameters : config.imageParameters;
  const intrinsicWidth = positiveDimension2(parameters.width);
  const intrinsicHeight = positiveDimension2(parameters.height);
  const aspect = resolveInlayImageAspect(placement === "cover" ? config.coverImageAspect : config.inlayImageAspect, { width: intrinsicWidth, height: intrinsicHeight });
  const viewportWidth = `calc(${maxHeight}vh * ${aspect.w} / ${aspect.h})`;
  const boxWidth = placement === "cover" ? `min(100%, ${clampInteger(config.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth)}px, ${viewportWidth})` : `min(100%, ${viewportWidth})`;
  const frameRatio = `${aspect.w}/${aspect.h}`;
  const commonFrameStyle = `width:${boxWidth};max-width:100%;max-height:${maxHeight}vh;aspect-ratio:${frameRatio};overflow:hidden;`;
  return {
    wrapperStyle: `display:flex;flex-direction:column;justify-content:center;align-items:${config.imageAlignment === "left" ? "flex-start" : "center"};margin:10px 0;width:100%;`,
    frameStyle: `display:block;${commonFrameStyle}`,
    placeholderFrameStyle: `display:flex;justify-content:center;align-items:center;${commonFrameStyle}`,
    imageStyle: `display:block;width:100%;height:100%;aspect-ratio:${frameRatio};object-fit:contain;border-radius:8px;cursor:zoom-in;`,
    intrinsicAttributes: intrinsicWidth && intrinsicHeight ? ` width="${intrinsicWidth}" height="${intrinsicHeight}"` : ""
  };
}

// src/frontend/inlay-display.ts
var INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';
var INLAY_PLACEMENT_ATTRIBUTE = "data-inlay-illustrator-placement";
var INLAY_FRAME_SELECTOR = ".inlay-illustrator-frame";
var IMAGE_SELECTOR = "[data-inlay-illustrator-image-id]";
function placementOf(element) {
  return element.getAttribute?.(INLAY_PLACEMENT_ATTRIBUTE) === "cover" ? "cover" : "paragraph";
}
function parametersOf(element) {
  const image = element.querySelector?.(IMAGE_SELECTOR);
  if (!image)
    return;
  const width = Number(image.getAttribute?.("width"));
  const height = Number(image.getAttribute?.("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return;
  return { width, height };
}
function applyInlayDisplaySettings(config, root) {
  const host = root ?? (typeof document !== "undefined" ? document : null);
  if (!host?.querySelectorAll)
    return 0;
  let updated = 0;
  const wrappers = host.querySelectorAll(INLAY_WRAPPER_SELECTOR);
  const count = Number(wrappers?.length ?? 0);
  for (let index = 0;index < count; index += 1) {
    const wrapper = wrappers[index];
    if (!wrapper)
      continue;
    const placement = placementOf(wrapper);
    const isPlaceholder = String(wrapper.className || "").includes("inlay-illustrator-placeholder");
    const frame = wrapper.querySelector?.(INLAY_FRAME_SELECTOR) ?? null;
    if (!frame?.style)
      continue;
    const geometry = inlayFrameGeometry(parametersOf(wrapper), placement, config);
    const nextWrapperStyle = geometry.wrapperStyle;
    const nextFrameStyle = isPlaceholder ? geometry.placeholderFrameStyle : geometry.frameStyle;
    if (wrapper.style && wrapper.style.cssText !== nextWrapperStyle) {
      wrapper.style.cssText = nextWrapperStyle;
      updated += 1;
    }
    if (frame.style.cssText !== nextFrameStyle) {
      frame.style.cssText = nextFrameStyle;
      updated += 1;
    }
    const image = isPlaceholder ? null : wrapper.querySelector?.(IMAGE_SELECTOR) ?? null;
    if (image?.style && image.style.cssText !== geometry.imageStyle) {
      image.style.cssText = geometry.imageStyle;
      updated += 1;
    }
  }
  return updated;
}

// src/frontend/constants.ts
var CLEANUP_KEY = "__inlayIllustratorCleanup";
var DRAWER_TAB_OPTIONS = {
  id: "inlay_illustrator",
  title: "Inlay Illustrator",
  shortName: "Inlay",
  headerTitle: "Inlay Illustrator",
  description: "Asset Maid-based scene illustration and character asset manager.",
  keywords: ["image", "illustration", "asset maid", "novelai"],
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M21 16l-5-5L5 19"/></svg>'
};
var HOST_STYLES = `
  [data-inlay-illustrator="true"] img[role="button"]{cursor:zoom-in}[data-inlay-illustrator="true"] img[role="button"]:focus-visible{outline:3px solid var(--lumiverse-primary);outline-offset:3px}
  .inlay-illustrator-placeholder{box-sizing:border-box;margin:10px auto;width:min(100%,720px);padding:12px 14px;border:1px dashed currentColor;border-radius:8px;text-align:center;opacity:.72}
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:auto}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
  .inlay-lightbox-meta span{padding:4px 8px;border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-block{min-width:0;padding:12px 14px 0}
  .inlay-lightbox-prompt-block:last-child{padding-bottom:14px}
  .inlay-lightbox-prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}.inlay-lightbox-prompt-block h4{margin:0;font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-heading button{border:0;background:transparent;color:var(--lumiverse-primary);padding:3px 5px;cursor:pointer;font:inherit;font-size:11px;font-weight:600}
  .inlay-lightbox-prompt{min-height:80px;margin:0;padding:10px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
`;

// src/frontend/message-router.ts
function routeBackendMessage(message, getActiveChatId, actions) {
  if (message.chatId && message.chatId !== getActiveChatId())
    return;
  if (message.type === "config_updated" && message.config) {
    actions.replaceConfig(normalizeConfig(message.config));
    return;
  }
  if (message.type === "state" && message.config) {
    const parserConnections = message.parserConnections || [];
    actions.replaceState({
      config: normalizeConfig(message.config),
      parserConnections,
      imageConnections: message.imageConnections || [],
      status: "Ready"
    });
    if (parserConnections.length === 0)
      actions.refreshParserConnections();
    return;
  }
  if (message.type === "status") {
    actions.updateStatus(message.error ? `${message.status || "Error"}: ${message.error}` : String(message.status || "Ready"));
  }
}

// src/frontend/lightbox.ts
var INLAY_IMAGE_SELECTOR = '[data-inlay-illustrator="true"] img';
var INLAY_WRAPPER_SELECTOR2 = '[data-inlay-illustrator="true"]';
function disableNativeInlayLightboxes(root) {
  root.querySelectorAll(INLAY_IMAGE_SELECTOR).forEach((image) => {
    image.removeAttribute("data-lightbox");
    if (!image.hasAttribute("tabindex"))
      image.setAttribute("tabindex", "0");
    if (!image.hasAttribute("role"))
      image.setAttribute("role", "button");
    if (!image.hasAttribute("aria-label"))
      image.setAttribute("aria-label", "Open illustration details");
  });
}
function resolveInlayPrompt(attributePrompt, fallbackPrompt) {
  return (attributePrompt || fallbackPrompt || "").trim();
}
function resolveInlayDetails(attributePrompt, fallbackPrompt, attributeNegative, fallbackNegative, perspectiveMode, perspectiveSource, creativeConcept = null) {
  const normalizedMode = perspectiveMode?.trim().toLowerCase();
  const normalizedSource = perspectiveSource?.trim().toLowerCase();
  return {
    prompt: resolveInlayPrompt(attributePrompt, fallbackPrompt),
    negativePrompt: resolveInlayPrompt(attributeNegative, fallbackNegative),
    perspectiveMode: normalizedMode === "creative" || normalizedMode === "static" || normalizedMode === "dynamic" || normalizedMode === "asset" ? normalizedMode : null,
    perspectiveSource: normalizedSource === "adaptive" || normalizedSource === "manual" ? normalizedSource : null,
    creativeConcept: (creativeConcept || "").trim()
  };
}
function findInlayImage(target) {
  if (!(target instanceof Element))
    return null;
  const image = target.closest(INLAY_IMAGE_SELECTOR);
  if (!image?.closest(INLAY_WRAPPER_SELECTOR2))
    return null;
  return image;
}
function detailsForImage(image) {
  const wrapper = image.closest(INLAY_WRAPPER_SELECTOR2);
  const fallback = wrapper?.querySelector(".inlay-illustrator-prompt")?.textContent || null;
  const fallbackNegative = wrapper?.querySelector(".inlay-illustrator-negative-prompt")?.textContent || null;
  return resolveInlayDetails(image.getAttribute("data-inlay-illustrator-prompt"), fallback, image.getAttribute("data-inlay-illustrator-negative-prompt"), fallbackNegative, image.getAttribute("data-inlay-illustrator-perspective"), image.getAttribute("data-inlay-illustrator-perspective-source"), image.getAttribute("data-inlay-illustrator-concept"));
}
function optionalInteger(value) {
  if (value === null || value.trim() === "")
    return;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function imageIdFromResultUrl(value) {
  const match = value.match(/\/api\/v1\/image-gen\/results\/([^?#]+)/i);
  if (!match?.[1])
    return;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
function actionTargetForImage(image) {
  const imageUrl = image.getAttribute("src") || image.currentSrc || image.src;
  return {
    chatId: image.getAttribute("data-inlay-illustrator-chat-id") || undefined,
    messageId: image.getAttribute("data-inlay-illustrator-message-id") || undefined,
    swipeId: optionalInteger(image.getAttribute("data-inlay-illustrator-swipe-id")),
    imageIndex: optionalInteger(image.getAttribute("data-inlay-illustrator-image-index")),
    imageId: image.getAttribute("data-inlay-illustrator-image-id") || imageIdFromResultUrl(imageUrl),
    imageUrl
  };
}
function promptBlock(label, value, fallback) {
  const block = document.createElement("section");
  block.className = "inlay-lightbox-prompt-block";
  const headingRow = document.createElement("div");
  headingRow.className = "inlay-lightbox-prompt-heading";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", `Copy ${label.toLowerCase()}`);
  const content = document.createElement("pre");
  content.className = "inlay-lightbox-prompt";
  content.textContent = value || fallback;
  copy.addEventListener("click", () => {
    const pending = navigator.clipboard?.writeText(content.textContent || "");
    if (!pending) {
      copy.textContent = "Select text";
      return;
    }
    pending.then(() => {
      copy.textContent = "Copied";
      window.setTimeout(() => {
        copy.textContent = "Copy";
      }, 1400);
    }).catch(() => {
      copy.textContent = "Select text";
    });
  });
  headingRow.append(heading, copy);
  block.append(headingRow, content);
  return block;
}
function appendLightboxContent(root, image, details) {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";
  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt || "Generated illustration";
  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation details";
  panel.append(heading);
  if (details.perspectiveMode || details.perspectiveSource) {
    const metadata = document.createElement("div");
    metadata.className = "inlay-lightbox-meta";
    if (details.perspectiveMode) {
      const mode = document.createElement("span");
      mode.textContent = `Perspective: ${details.perspectiveMode[0].toUpperCase()}${details.perspectiveMode.slice(1)}`;
      metadata.append(mode);
    }
    if (details.perspectiveSource) {
      const source = document.createElement("span");
      source.textContent = `Selection: ${details.perspectiveSource === "adaptive" ? "Adaptive" : "Manual"}`;
      metadata.append(source);
    }
    panel.append(metadata);
  }
  if (details.creativeConcept) {
    panel.append(promptBlock("Creative concept", details.creativeConcept, ""));
  }
  panel.append(promptBlock("Positive prompt", details.prompt, "No prompt was recorded for this image."), promptBlock("Negative prompt", details.negativePrompt, "No negative prompt was recorded for this image."));
  layout.append(preview, panel);
  root.replaceChildren(layout);
}
function installInlayLightbox(ctx) {
  let activeModal = null;
  let activeDetailsRequest = null;
  disableNativeInlayLightboxes(document);
  const observer = new MutationObserver(() => disableNativeInlayLightboxes(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const unsubscribeResults = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const result = payload;
    if (result.type === "inlay_image_details_result" && String(result.requestId || "") === activeDetailsRequest?.id) {
      if (result.ok === true) {
        activeDetailsRequest.render(resolveInlayDetails(typeof result.prompt === "string" ? result.prompt : null, null, typeof result.negativePrompt === "string" ? result.negativePrompt : null, null, typeof result.perspectiveMode === "string" ? result.perspectiveMode : null, typeof result.perspectiveSource === "string" ? result.perspectiveSource : null, typeof result.creativeConcept === "string" ? result.creativeConcept : null));
      }
      activeDetailsRequest = null;
      return;
    }
  });
  const onClick = (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const image = event.composedPath().map((target) => findInlayImage(target ?? null)).find((candidate) => Boolean(candidate)) || findInlayImage(event.target);
    if (!image)
      return;
    const details = detailsForImage(image);
    const actionTarget = actionTargetForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      const render = (nextDetails) => appendLightboxContent(modal.root, image, nextDetails);
      render(details);
      if (actionTarget.imageId || actionTarget.messageId) {
        let chatId = actionTarget.chatId || "";
        if (!chatId) {
          try {
            chatId = String(ctx.getActiveChat().chatId || "");
          } catch {
            chatId = "";
          }
        }
        if (chatId) {
          const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `inlay-details-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          activeDetailsRequest = { id: requestId, modal, render };
          ctx.sendToBackend({ type: "get_inlay_image_details", requestId, ...actionTarget, chatId });
        }
      }
      modal.onDismiss(() => {
        if (activeModal === modal)
          activeModal = null;
        if (activeDetailsRequest?.modal === modal)
          activeDetailsRequest = null;
      });
    } catch {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };
  const onKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ")
      return;
    const image = findInlayImage(event.target);
    if (!image)
      return;
    event.preventDefault();
    image.click();
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  return () => {
    observer.disconnect();
    unsubscribeResults();
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    activeModal?.dismiss();
    activeModal = null;
  };
}

// src/frontend/fab.ts
var FAB_INSET_PX = 20;
var FAB_MENU_GAP_PX = 8;
var FAB_MENU_MARGIN_PX = 8;
var FAB_CSS = `
.inlay-fab {
  position: fixed;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-primary, #6366f1);
  color: var(--lumiverse-primary-contrast, #ffffff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9950;
  box-shadow: var(--lumiverse-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.3));
  overflow: hidden;
  white-space: nowrap;
  padding: 0;
  box-sizing: border-box;
  font-family: inherit;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s ease,
              box-shadow 0.15s ease,
              background-color 0.2s ease;
}
.inlay-fab:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.inlay-fab-icon svg {
  width: 24px;
  height: 24px;
}
.inlay-fab-label {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  pointer-events: none;
  transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease,
              margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Normal state (images present) hover */
.inlay-fab:not(.inlay-fab-empty-turn):hover,
.inlay-fab:not(.inlay-fab-empty-turn):focus-visible {
  transform: scale(1.06);
}

/* Empty turn (no images yet): smooth expansion from circle to pill with text on hover or keyboard focus */
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible {
  width: 176px;
  padding: 0 16px 0 12px;
  background: var(--lumiverse-primary-hover, #4f46e5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
}
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover .inlay-fab-label,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible .inlay-fab-label {
  max-width: 120px;
  opacity: 1;
  margin-left: 8px;
}

/* Busy indicator */
.inlay-fab.inlay-fab-busy {
  cursor: progress;
}
.inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
  animation: inlay-fab-spin 1s linear infinite;
}

/* Action Popup Menu */
.inlay-fab-menu {
  position: fixed;
  min-width: 230px;
  padding: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  border-radius: 12px;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 9951;
}
.inlay-fab-menu[hidden] {
  display: none;
}
.inlay-fab-menu[aria-hidden="true"] {
  display: none;
}
.inlay-fab-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-fab-menu button:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-fab-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.inlay-fab-menu svg {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}
@keyframes inlay-fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .inlay-fab {
    transition: none;
  }
  .inlay-fab:hover {
    transform: none;
  }
  .inlay-fab-label {
    transition: none;
  }
  .inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
    animation-duration: 2.5s;
  }
}
`;
var SVG_INLAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>`;
var SVG_GENERATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>`;
var SVG_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
var SVG_LLM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/></svg>`;
var SVG_GALLERY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
var MENU_REROLL = "reroll";
var MENU_SIDECAR = "sidecar";
var MENU_GALLERY = "gallery";
var MENU_SETTINGS = "settings";
var SVG_SETTINGS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
function px(value) {
  return `${value}px`;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function fabButtonEdges(corner) {
  const inset = px(FAB_INSET_PX);
  if (corner === "bottom-right")
    return { right: inset, bottom: inset, left: "auto", top: "auto" };
  if (corner === "bottom-left")
    return { left: inset, bottom: inset, right: "auto", top: "auto" };
  if (corner === "top-right")
    return { right: inset, top: inset, left: "auto", bottom: "auto" };
  return { left: inset, top: inset, right: "auto", bottom: "auto" };
}
function fabButtonRect(corner, viewport) {
  const size = 48;
  const left = corner.endsWith("-right") ? viewport.width - FAB_INSET_PX - size : FAB_INSET_PX;
  const top = corner.startsWith("top") ? FAB_INSET_PX : viewport.height - FAB_INSET_PX - size;
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}
function fabMenuPosition(corner, button, menu, viewport, gap = FAB_MENU_GAP_PX, margin = FAB_MENU_MARGIN_PX) {
  const anchorRight = corner.endsWith("-right");
  const opensDownward = corner.startsWith("top");
  let left = anchorRight ? button.right - menu.width : button.left;
  left = clamp(left, margin, Math.max(margin, viewport.width - margin - menu.width));
  let top;
  if (opensDownward) {
    top = button.bottom + gap;
    const flipped = button.top - gap - menu.height;
    if (top + menu.height > viewport.height - margin && flipped >= margin)
      top = flipped;
  } else {
    top = button.top - gap - menu.height;
    const flipped = button.bottom + gap;
    if (top < margin && flipped + menu.height <= viewport.height - margin)
      top = flipped;
  }
  top = clamp(top, margin, Math.max(margin, viewport.height - margin - menu.height));
  return { left, top };
}
function makeRequestId(prefix = "inlay-fab") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function installInlayFab(ctx, options) {
  if (typeof document === "undefined")
    return () => {};
  let corner = normalizeFabCorner(options.getCorner());
  let busy = false;
  let menuOpen = false;
  let hasImagesThisTurn = null;
  const removeStyle = ctx.dom.addStyle(FAB_CSS);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inlay-fab";
  button.setAttribute("aria-label", "Inlay Illustrator actions");
  const iconWrap = document.createElement("span");
  iconWrap.className = "inlay-fab-icon";
  iconWrap.innerHTML = SVG_INLAY;
  const labelSpan = document.createElement("span");
  labelSpan.className = "inlay-fab-label";
  labelSpan.textContent = "Generate images";
  button.append(iconWrap, labelSpan);
  const menu = document.createElement("div");
  menu.className = "inlay-fab-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  menu.hidden = true;
  function menuItem(action, label, svg) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `${svg}<span>${label}</span>`;
    item.addEventListener("click", () => {
      closeMenu();
      run(action);
    });
    return item;
  }
  const rerollItem = menuItem(MENU_REROLL, "Reroll images (from this turn)", SVG_REFRESH);
  const sidecarItem = menuItem(MENU_SIDECAR, "Reroll images with sidecar (from this turn)", SVG_LLM);
  const galleryItem = menuItem(MENU_GALLERY, "Open Gallery", SVG_GALLERY);
  const settingsItem = menuItem(MENU_SETTINGS, "Open Settings", SVG_SETTINGS);
  menu.append(rerollItem, sidecarItem, galleryItem, settingsItem);
  function applyEdges(element, edges) {
    element.style.left = edges.left ?? "auto";
    element.style.right = edges.right ?? "auto";
    element.style.top = edges.top ?? "auto";
    element.style.bottom = edges.bottom ?? "auto";
  }
  function positionFab() {
    applyEdges(button, fabButtonEdges(corner));
  }
  function positionMenu() {
    const buttonRect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : fabButtonRect(corner, { width: window.innerWidth, height: window.innerHeight });
    const measured = typeof menu.getBoundingClientRect === "function" ? menu.getBoundingClientRect() : { width: 0, height: 0 };
    const menuWidth = measured && measured.width > 0 ? measured.width : 230;
    const menuHeight = measured && measured.height > 0 ? measured.height : 140;
    const position = fabMenuPosition(corner, {
      left: buttonRect.left,
      top: buttonRect.top,
      right: buttonRect.right,
      bottom: buttonRect.bottom,
      width: buttonRect.width,
      height: buttonRect.height
    }, { width: menuWidth, height: menuHeight }, { width: window.innerWidth, height: window.innerHeight });
    menu.style.left = px(position.left);
    menu.style.top = px(position.top);
    menu.style.right = "auto";
    menu.style.bottom = "auto";
  }
  function openMenu() {
    if (menuOpen || busy)
      return;
    menuOpen = true;
    menu.hidden = false;
    menu.setAttribute("aria-hidden", "false");
    positionMenu();
    button.setAttribute("aria-expanded", "true");
    rerollItem.disabled = busy;
    sidecarItem.disabled = busy;
  }
  function closeMenu() {
    if (!menuOpen)
      return;
    menuOpen = false;
    menu.hidden = true;
    menu.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-expanded", "false");
  }
  function updateTurnState(hasImages) {
    if (hasImagesThisTurn === hasImages && button.classList.contains("inlay-fab-empty-turn") !== hasImages) {
      return;
    }
    hasImagesThisTurn = hasImages;
    button.classList.toggle("inlay-fab-empty-turn", !hasImages);
    if (!hasImages) {
      iconWrap.innerHTML = SVG_GENERATE;
      button.title = "Generate illustrations for this message";
      button.setAttribute("aria-label", "Generate illustrations for this message");
      button.removeAttribute("aria-haspopup");
      button.removeAttribute("aria-expanded");
      closeMenu();
    } else {
      iconWrap.innerHTML = SVG_INLAY;
      button.title = "Inlay Illustrator actions";
      button.setAttribute("aria-label", "Inlay Illustrator actions");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", String(menuOpen));
    }
  }
  function setBusy(next) {
    busy = next;
    button.classList.toggle("inlay-fab-busy", next);
    if (menuOpen) {
      rerollItem.disabled = next;
      sidecarItem.disabled = next;
    }
  }
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  function detectCurrentTurnImages() {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function")
      return false;
    try {
      const messages = Array.from(document.querySelectorAll("[data-message-id], .chat-message, .message")).filter((el) => {
        if (typeof el.closest === "function") {
          return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
        }
        return true;
      });
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && typeof lastMsg.querySelector === "function") {
          const img = lastMsg.querySelector('[data-inlay-illustrator="true"] img');
          return Boolean(img && (img.currentSrc || img.src || img.getAttribute("data-inlay-illustrator-image-url")));
        }
        return false;
      }
      const inlays = Array.from(document.querySelectorAll('[data-inlay-illustrator="true"]')).filter((el) => {
        if (typeof el.closest === "function") {
          return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
        }
        return true;
      });
      if (inlays.length === 0)
        return false;
      const lastInlay = inlays[inlays.length - 1];
      if (!lastInlay || typeof lastInlay.querySelector !== "function")
        return false;
      const img = lastInlay.querySelector("img");
      return Boolean(img && (img.currentSrc || img.src || img.getAttribute("data-inlay-illustrator-image-url")));
    } catch {
      return false;
    }
  }
  function checkTurnState() {
    const hasImages = detectCurrentTurnImages();
    updateTurnState(hasImages);
  }
  function run(action) {
    if (action === MENU_SETTINGS) {
      if (typeof options.openSettings === "function") {
        options.openSettings();
      }
      return;
    }
    if (action === MENU_GALLERY) {
      options.openGallery();
      return;
    }
    const chatId = activeChatId();
    if (!chatId)
      return;
    setBusy(true);
    ctx.sendToBackend({
      type: "reroll_all_images",
      requestId: makeRequestId("inlay-fab-reroll-all"),
      chatId,
      sidecar: action === MENU_SIDECAR
    });
  }
  function handleButtonClick() {
    if (busy)
      return;
    if (!hasImagesThisTurn) {
      const chatId = activeChatId();
      if (!chatId)
        return;
      setBusy(true);
      ctx.sendToBackend({
        type: "generate_latest",
        chatId
      });
      return;
    }
    if (menuOpen)
      closeMenu();
    else
      openMenu();
  }
  button.addEventListener("click", handleButtonClick);
  const onDocumentClick = (event) => {
    if (!menuOpen)
      return;
    const target = event.target;
    if (menu.contains(target) || button.contains(target))
      return;
    closeMenu();
  };
  const onDocumentKey = (event) => {
    if (event.key === "Escape")
      closeMenu();
  };
  const onResize = () => {
    if (menuOpen)
      positionMenu();
  };
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKey, true);
  window.addEventListener("resize", onResize);
  document.body.append(button, menu);
  positionFab();
  checkTurnState();
  let chatObserver = null;
  let checkDebounceTimer = null;
  if (typeof MutationObserver !== "undefined" && document.body) {
    try {
      chatObserver = new MutationObserver((mutations) => {
        const external = mutations.some((m) => {
          const target = m.target;
          return !button.contains(target) && !menu.contains(target);
        });
        if (!external)
          return;
        if (checkDebounceTimer)
          clearTimeout(checkDebounceTimer);
        checkDebounceTimer = setTimeout(() => {
          checkTurnState();
        }, 50);
      });
      chatObserver.observe(document.body, { childList: true, subtree: true });
    } catch {
      chatObserver = null;
    }
  }
  function setCorner(next) {
    corner = normalizeFabCorner(next);
    positionFab();
    if (menuOpen)
      positionMenu();
  }
  const unsubscribeBackend = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const message = payload;
    if (message.type === "status") {
      if (typeof message.busy === "boolean") {
        setBusy(message.busy === true);
      } else {
        const s = String(message.status || "");
        if (s === "Generated" || s === "Error" || s === "Ready" || s === "Skipped" || s === "No image generated" || s === "Already generated" || s.startsWith("Error:") || Boolean(message.error)) {
          setBusy(false);
        }
      }
      checkTurnState();
    } else if (message.type === "generation_progress") {
      const stage = String(message.stage || "");
      if (stage === "completed" || stage === "failed" || stage === "cancelled") {
        setBusy(false);
      }
      checkTurnState();
    } else if (message.type === "config_updated" || message.type === "state") {
      const config = message.config && typeof message.config === "object" ? message.config : null;
      if (config && config.fabCorner !== undefined) {
        setCorner(config.fabCorner);
      }
      checkTurnState();
    } else if (message.type === "inlay_reroll_all_result" || message.type === "inlay_image_action_result") {
      setBusy(false);
      checkTurnState();
    }
  });
  return () => {
    unsubscribeBackend();
    if (checkDebounceTimer)
      clearTimeout(checkDebounceTimer);
    chatObserver?.disconnect();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    window.removeEventListener("resize", onResize);
    closeMenu();
    button.remove();
    menu.remove();
    removeStyle();
  };
}

// src/frontend/modal.ts
var activeModalCount = 0;
var previousBodyOverflow = "";
var modalStack = [];
var MODAL_CSS = `
.inlay-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9980;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open {
  opacity: 1;
}
.inlay-modal-dialog {
  position: relative;
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  border: 1px solid var(--lumiverse-border, #2e3048);
  border-radius: 14px;
  box-shadow: var(--lumiverse-shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
  overflow: hidden;
  outline: none;
  transform: scale(0.96) translateY(8px);
  opacity: 0;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open .inlay-modal-dialog {
  transform: scale(1) translateY(0);
  opacity: 1;
}
.inlay-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--lumiverse-border, #2e3048);
  background: var(--lumiverse-header-bg, rgba(255, 255, 255, 0.03));
  flex-shrink: 0;
}
.inlay-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
  line-height: 1.4;
}
.inlay-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.inlay-modal-close:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
  color: var(--lumiverse-text, #ffffff);
}
.inlay-modal-close:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-modal-body {
  flex: 1 1 auto;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (prefers-reduced-motion: reduce) {
  .inlay-modal-backdrop,
  .inlay-modal-dialog {
    transition: none;
  }
}
`;
function ensureModalStyles() {
  if (typeof document === "undefined")
    return;
  const styleId = "inlay-native-modal-styles";
  if (typeof document.getElementById === "function") {
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = MODAL_CSS;
      if (document.head && typeof document.head.append === "function") {
        document.head.append(styleEl);
      }
    }
  }
}
function cleanupModalStyles() {
  if (typeof document === "undefined")
    return;
  const styleEl = document.getElementById("inlay-native-modal-styles");
  if (styleEl && typeof styleEl.remove === "function") {
    styleEl.remove();
  }
  activeModalCount = 0;
  modalStack.length = 0;
  if (document.body) {
    document.body.style.overflow = previousBodyOverflow || "";
    previousBodyOverflow = "";
  }
}
function showNativeModal(options) {
  if (typeof document === "undefined") {
    return {
      root: {},
      dialog: {},
      overlay: {},
      dismiss: () => {},
      onDismiss: (cb) => {
        cb();
      }
    };
  }
  ensureModalStyles();
  const activeElementBefore = typeof document !== "undefined" && typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = document.createElement("div");
  backdrop.className = "inlay-modal-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  const dialog = document.createElement("div");
  dialog.className = `inlay-modal-dialog ${options.className || ""}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  if (options.width) {
    dialog.style.maxWidth = typeof options.width === "number" ? `${options.width}px` : options.width;
  }
  if (options.maxHeight) {
    dialog.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;
  }
  const titleId = `inlay-modal-title-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const header = document.createElement("div");
  header.className = "inlay-modal-header";
  const title = document.createElement("h3");
  title.id = titleId;
  title.className = "inlay-modal-title";
  title.textContent = options.title;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "inlay-modal-close";
  closeBtn.setAttribute("aria-label", "Close dialog");
  closeBtn.innerHTML = "&times;";
  header.append(title, closeBtn);
  const body = document.createElement("div");
  body.className = "inlay-modal-body";
  dialog.append(header, body);
  backdrop.append(dialog);
  let isDismissed = false;
  let mouseDownTarget = null;
  const dismissCallbacks = [];
  const handle = {
    root: body,
    dialog,
    overlay: backdrop,
    dismiss,
    onDismiss(cb) {
      if (isDismissed) {
        cb();
      } else {
        dismissCallbacks.push(cb);
      }
    }
  };
  modalStack.push(handle);
  if (typeof document !== "undefined" && document.body) {
    if (activeModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalCount++;
    document.body.append(backdrop);
  }
  requestAnimationFrame(() => {
    if (isDismissed)
      return;
    backdrop.classList.add("is-open");
    backdrop.removeAttribute("aria-hidden");
    dialog.focus();
  });
  function dismiss() {
    if (isDismissed)
      return;
    isDismissed = true;
    const stackIndex = modalStack.indexOf(handle);
    if (stackIndex >= 0)
      modalStack.splice(stackIndex, 1);
    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeyDown, false);
    backdrop.removeEventListener("click", onBackdropClick);
    backdrop.removeEventListener("mousedown", onBackdropMouseDown);
    activeModalCount = Math.max(0, activeModalCount - 1);
    if (activeModalCount === 0 && typeof document !== "undefined" && document.body) {
      document.body.style.overflow = previousBodyOverflow || "";
    }
    setTimeout(() => {
      backdrop.remove();
      for (const cb of dismissCallbacks) {
        try {
          cb();
        } catch {}
      }
      dismissCallbacks.length = 0;
      activeElementBefore?.focus();
    }, 200);
  }
  function onBackdropMouseDown(e) {
    mouseDownTarget = e.target;
  }
  function onBackdropClick(e) {
    if (e.target === backdrop && mouseDownTarget === backdrop) {
      dismiss();
    }
    mouseDownTarget = null;
  }
  function getFocusableElements() {
    return Array.from(dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hidden && (!el.style || el.style.display !== "none") && (typeof el.closest !== "function" || el.closest("[hidden]") === null));
  }
  function onKeyDown(e) {
    if (isDismissed)
      return;
    if (modalStack.length > 0 && modalStack[modalStack.length - 1] !== handle) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === "Tab") {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
  closeBtn.addEventListener("click", () => dismiss());
  backdrop.addEventListener("mousedown", onBackdropMouseDown);
  backdrop.addEventListener("click", onBackdropClick);
  document.addEventListener("keydown", onKeyDown, false);
  return handle;
}

// src/frontend/gallery.ts
var CHATS_PER_PAGE = 5;
function makeRequestId2() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
var GALLERY_CSS = `
.inlay-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: inherit;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.inlay-gallery-chat-select {
  flex: 1 1 auto;
  max-width: 400px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-input-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.inlay-gallery-chat-select:focus-visible {
  border-color: var(--lumiverse-primary, #6366f1);
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 1px;
}
.inlay-gallery-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-pagination button {
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-gallery-pagination button:hover:not(:disabled) {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.inlay-gallery-status {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 14px;
}
.inlay-gallery-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-chat:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.inlay-gallery-chat-heading {
  font-size: 15px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-chat-meta {
  font-size: 12px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.inlay-gallery-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-card-bg, #202230);
  overflow: hidden;
  box-shadow: var(--lumiverse-shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.2));
}
.inlay-gallery-badge {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.3);
  font-size: 11px;
  font-weight: 600;
  color: var(--lumiverse-text-muted, #a0a3b2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.inlay-gallery-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
  cursor: pointer;
}
.inlay-gallery-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}
.inlay-gallery-image-wrap:hover img {
  transform: scale(1.04);
}
.inlay-gallery-quote {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-style: italic;
  color: var(--lumiverse-text-muted, #cbd0e0);
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
`;
function createInlayGallery(ctx) {
  let activeModal = null;
  let activeRoot = null;
  let navRoot = null;
  let paginationRoot = null;
  let contentRoot = null;
  let statusRoot = null;
  let currentPage = 1;
  let selectedChatId = null;
  let savedAllPage = 1;
  let chatIds = [];
  const chatLabels = new Map;
  let totalChats = 0;
  let totalPages = 1;
  let isDismissed = false;
  let pendingRequestId = null;
  const removeStyle = ctx.dom.addStyle(GALLERY_CSS);
  function showStatus(message, isError = false) {
    if (!statusRoot)
      return;
    statusRoot.textContent = message;
    statusRoot.hidden = !message;
    statusRoot.setAttribute("role", isError ? "alert" : "status");
    statusRoot.setAttribute("aria-live", isError ? "assertive" : "polite");
  }
  function clearContent() {
    if (contentRoot)
      contentRoot.replaceChildren();
    if (statusRoot) {
      statusRoot.textContent = "";
      statusRoot.hidden = true;
    }
  }
  function renderLoading() {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = "Loading gallery…";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-busy", "true");
    contentRoot.append(node);
    showStatus("Loading gallery…");
  }
  function renderError(message) {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = message || "Failed to load gallery.";
    node.setAttribute("role", "alert");
    contentRoot.append(node);
    showStatus(message || "Failed to load gallery.", true);
  }
  function renderEmpty(message = "No saved Inlay history.") {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-empty";
    node.textContent = message;
    contentRoot.append(node);
  }
  function createImageCard(image) {
    const card = document.createElement("div");
    card.className = "inlay-gallery-card";
    const badge = document.createElement("div");
    badge.className = "inlay-gallery-badge";
    badge.textContent = `Paragraph ${image.paragraph}`;
    card.append(badge);
    const wrap = document.createElement("div");
    wrap.className = "inlay-gallery-image-wrap";
    wrap.setAttribute("data-inlay-illustrator", "true");
    const img = document.createElement("img");
    img.src = image.imageUrl;
    img.alt = `Inlay ${image.imageIndex + 1} paragraph ${image.paragraph}`;
    img.loading = "lazy";
    img.setAttribute("data-inlay-illustrator-chat-id", image.chatId);
    img.setAttribute("data-inlay-illustrator-message-id", image.messageId);
    img.setAttribute("data-inlay-illustrator-swipe-id", String(image.swipeId ?? 0));
    img.setAttribute("data-inlay-illustrator-image-index", String(image.imageIndex ?? 0));
    if (image.imageId)
      img.setAttribute("data-inlay-illustrator-image-id", image.imageId);
    img.setAttribute("data-inlay-illustrator-prompt", image.prompt || "");
    img.setAttribute("data-inlay-illustrator-negative-prompt", image.negativePrompt || "");
    if (image.quote)
      img.setAttribute("data-inlay-illustrator-quote", image.quote);
    wrap.append(img);
    card.append(wrap);
    if (image.quote) {
      const quote = document.createElement("blockquote");
      quote.className = "inlay-gallery-quote";
      quote.textContent = image.quote;
      card.append(quote);
    }
    return card;
  }
  function renderChatSection(chat, showHeading) {
    const section = document.createElement("section");
    section.className = "inlay-gallery-chat";
    if (showHeading) {
      const heading = document.createElement("div");
      heading.className = "inlay-gallery-chat-heading";
      heading.textContent = `\uD83D\uDCAC ${chat.cardName || chat.name || `Chat #${chat.chatId}`}`;
      section.append(heading);
      const metaBits = [];
      if (typeof chat.messageCount === "number") {
        metaBits.push(`${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`);
      }
      if (chat.images && chat.images.length) {
        metaBits.push(`${chat.images.length} image${chat.images.length === 1 ? "" : "s"}`);
      }
      if (typeof chat.branchCount === "number" && chat.branchCount > 0) {
        metaBits.push(`${chat.branchCount} branch${chat.branchCount === 1 ? "" : "es"}`);
      }
      if (chat.cardName && chat.name && chat.name !== chat.cardName) {
        metaBits.unshift(chat.name);
      }
      if (metaBits.length) {
        const meta = document.createElement("div");
        meta.className = "inlay-gallery-chat-meta";
        meta.textContent = metaBits.join(" · ");
        section.append(meta);
      }
    }
    const grid = document.createElement("div");
    grid.className = "inlay-gallery-grid";
    const sorted = [...chat.images].sort((a, b) => a.paragraph - b.paragraph || a.imageIndex - b.imageIndex);
    for (const image of sorted) {
      grid.append(createImageCard(image));
    }
    section.append(grid);
    return section;
  }
  function renderNav() {
    if (!navRoot)
      return;
    navRoot.replaceChildren();
    const select = document.createElement("select");
    select.className = "inlay-gallery-chat-select";
    select.setAttribute("aria-label", "Filter gallery by chat");
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All chats";
    select.append(allOption);
    for (const cid of chatIds) {
      const option = document.createElement("option");
      option.value = cid;
      option.textContent = chatLabels.get(cid) || `#${cid}`;
      select.append(option);
    }
    select.value = selectedChatId || "";
    select.addEventListener("change", () => {
      const next = select.value;
      if (next === "") {
        selectedChatId = null;
        requestGallery(savedAllPage, null);
      } else {
        selectedChatId = next;
        requestGallery(1, next);
      }
    });
    navRoot.append(select);
    navRoot.setAttribute("role", "navigation");
    navRoot.setAttribute("aria-label", "Chat gallery navigation");
  }
  function renderPagination() {
    if (!paginationRoot)
      return;
    paginationRoot.replaceChildren();
    if (selectedChatId !== null) {
      paginationRoot.hidden = true;
      return;
    }
    paginationRoot.hidden = false;
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "◀ Prev";
    prev.setAttribute("aria-label", "Previous page");
    prev.disabled = currentPage <= 1;
    prev.addEventListener("click", () => {
      if (currentPage > 1)
        requestGallery(currentPage - 1, null);
    });
    const info = document.createElement("span");
    info.textContent = `Page ${currentPage} / ${totalPages}`;
    info.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next ▶";
    next.setAttribute("aria-label", "Next page");
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => {
      if (currentPage < totalPages)
        requestGallery(currentPage + 1, null);
    });
    paginationRoot.append(prev, info, next);
    paginationRoot.setAttribute("role", "navigation");
    paginationRoot.setAttribute("aria-label", "Gallery pagination");
  }
  function renderGalleryData(chats) {
    if (!contentRoot)
      return;
    clearContent();
    if (totalChats === 0) {
      renderEmpty();
      return;
    }
    if (chats.length === 0) {
      renderEmpty("No images for this selection.");
      return;
    }
    const showHeadings = selectedChatId === null;
    for (const chat of chats) {
      contentRoot.append(renderChatSection(chat, showHeadings));
    }
    showStatus(`Showing ${chats.length} chat(s) · ${chats.reduce((acc, c) => acc + c.images.length, 0)} image(s)`);
  }
  function requestGallery(page, selected) {
    if (selected === null) {
      savedAllPage = page;
    }
    currentPage = page;
    selectedChatId = selected;
    const requestId = makeRequestId2();
    pendingRequestId = requestId;
    renderLoading();
    renderNav();
    renderPagination();
    ctx.sendToBackend({
      type: "list_inlay_gallery",
      requestId,
      page: selected ? 1 : page,
      selectedChatId: selected || undefined
    });
  }
  function handleGalleryResult(payload) {
    if (!payload || typeof payload !== "object")
      return;
    const msg = payload;
    if (msg.type !== "inlay_gallery_result")
      return;
    if (!activeModal || !activeRoot || isDismissed)
      return;
    if (pendingRequestId && msg.requestId !== pendingRequestId)
      return;
    pendingRequestId = null;
    if (msg.ok === false) {
      renderError(msg.error || "Failed to load gallery.");
      return;
    }
    totalChats = typeof msg.totalChats === "number" ? msg.totalChats : totalChats;
    totalPages = typeof msg.totalPages === "number" && msg.totalPages >= 1 ? msg.totalPages : Math.max(1, Math.ceil(totalChats / CHATS_PER_PAGE));
    if (selectedChatId === null && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    } else if (chatIds.length === 0 && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    }
    currentPage = typeof msg.page === "number" && msg.page >= 1 ? msg.page : currentPage;
    if (selectedChatId === null)
      savedAllPage = currentPage;
    const chats = Array.isArray(msg.chats) ? msg.chats : Array.isArray(msg.records) ? msg.records : [];
    for (const chat of chats) {
      if (!chat || typeof chat.chatId !== "string")
        continue;
      chatLabels.set(chat.chatId, chat.cardName || chat.name || `#${chat.chatId}`);
    }
    renderNav();
    renderPagination();
    renderGalleryData(chats);
  }
  const off = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const msg = payload;
    if (msg.type === "inlay_gallery_result") {
      handleGalleryResult(payload);
    } else if (msg.type === "inlay_image_action_result" && activeModal && !isDismissed) {
      if (msg.ok !== false && msg.record) {
        requestGallery(currentPage, selectedChatId);
      }
    }
  });
  function ensureStructure() {
    if (!activeModal || !activeRoot)
      return;
    activeRoot.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-gallery";
    navRoot = document.createElement("div");
    navRoot.className = "inlay-gallery-nav";
    paginationRoot = document.createElement("div");
    paginationRoot.className = "inlay-gallery-pagination";
    contentRoot = document.createElement("div");
    contentRoot.className = "inlay-gallery-content";
    contentRoot.setAttribute("role", "region");
    contentRoot.setAttribute("aria-label", "Gallery images");
    statusRoot = document.createElement("div");
    statusRoot.className = "inlay-gallery-status";
    statusRoot.hidden = true;
    statusRoot.setAttribute("role", "status");
    statusRoot.setAttribute("aria-live", "polite");
    wrapper.append(navRoot, paginationRoot, statusRoot, contentRoot);
    activeRoot.append(wrapper);
  }
  function open(initialChatId) {
    if (activeModal) {
      try {
        activeModal.dismiss();
      } catch {}
      activeModal = null;
    }
    isDismissed = false;
    const scopeChatId = typeof initialChatId === "string" && initialChatId ? initialChatId : null;
    const modal = showNativeModal({
      title: scopeChatId ? "Current chat gallery" : "Inlay gallery",
      width: 900,
      maxHeight: 750
    });
    activeModal = modal;
    activeRoot = modal.root;
    ensureStructure();
    chatIds = [];
    chatLabels.clear();
    totalChats = 0;
    totalPages = 1;
    currentPage = 1;
    savedAllPage = 1;
    selectedChatId = scopeChatId;
    pendingRequestId = null;
    renderLoading();
    requestGallery(1, scopeChatId);
    modal.onDismiss(() => {
      isDismissed = true;
      activeModal = null;
      activeRoot = null;
      navRoot = null;
      paginationRoot = null;
      contentRoot = null;
      statusRoot = null;
      pendingRequestId = null;
    });
  }
  function destroy() {
    off();
    removeStyle();
    if (activeModal) {
      try {
        activeModal.dismiss();
      } catch {}
      activeModal = null;
    }
    isDismissed = true;
  }
  return { open, destroy };
}

// src/frontend/overlay/constants.ts
var OVERLAY_ROOT_CLASS = "ii-am-root";
var OVERLAY_FRAME_CLASS = "ii-am-overlay";
var MOBILE_MEDIA_QUERY = "(max-width: 600px), (pointer: coarse)";
var INPUT_BAR_ACTION_ID = "inlay_illustrator_open";

// src/frontend/overlay/escape.ts
function handleOverlayEscape(event, state) {
  if (event.key !== "Escape" || event.isComposing || !state.open || !state.root)
    return false;
  const target = event.target;
  const doc = state.root.ownerDocument;
  const fromPage = !target || target === doc || target === doc?.body || target === doc?.documentElement;
  if (!fromPage && !(typeof state.root.contains === "function" && state.root.contains(target)))
    return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (!state.layers.closeTop())
    state.closeOverlay();
  return true;
}

// src/frontend/overlay/labels.ts
var SHELL_LABELS = {
  appName: "Inlay Illustrator",
  workspaceNav: "Asset Maid workspace",
  close: "Close",
  openSettings: "Open settings screen",
  settings: "Asset Maid settings",
  backToWorkspace: "Back to Asset Maid",
  sidebarToggle: (label) => `${label} open/close`,
  sidebarClose: (label) => `${label} close`,
  rosterList: "Lorebook list",
  settingsList: "Settings list",
  characterSelection: "Character selection",
  noCharacter: "No character",
  noChat: "Open a chat to start.",
  rosterTitle: "Roster",
  rosterPlaceholder: "Characters from the current card and its lorebooks appear here.",
  placeholderNote: "This screen is part of the Asset Maid port and is not available yet.",
  stopTask: "Stop task",
  closeNotification: "Close notification",
  cancel: "Cancel"
};
var WORKSPACE_TABS = [
  { id: "assets", label: "Asset analysis", mobileLabel: "Assets", description: "Analyse character images and outfits." },
  { id: "prompts", label: "Prompts", mobileLabel: "Prompts", description: "Edit the prompts of registered people." },
  { id: "artists", label: "Artist selection", mobileLabel: "Artists", description: "Choose artist tags for image generation." },
  { id: "persona", label: "Persona", mobileLabel: "Persona", description: "Persona appearance and outfits." }
];
var SETTINGS_GROUPS = [
  { label: "Asset Maid", items: [{ id: "analysis-profile", label: "Analysis settings" }] },
  {
    label: "Character",
    items: [
      { id: "charx", label: "Current character settings" },
      { id: "all-charx", label: "All characters settings" }
    ]
  },
  {
    label: "System",
    items: [
      { id: "model", label: "Model settings" },
      { id: "image-model", label: "Image generation model settings" },
      { id: "system", label: "System settings" }
    ]
  },
  { label: "Developer", items: [{ id: "logs", label: "Run logs", developerOnly: true }] }
];
var DEFAULT_SETTINGS_SECTION = "charx";
var SYSTEM_SETTINGS_LABELS = {
  displaySection: "In-chat display",
  fabCorner: "Floating button corner",
  fabCornerDescription: "Corner of the chat-side Inlay button.",
  imageAspect: "Image frame",
  imageAspectDescription: "Frame ratio of illustrations inside messages.",
  imageHeight: "Maximum image height",
  imageHeightDescription: "Percent of the viewport height.",
  alignment: "Align images left",
  alignmentDescription: "Otherwise images are centred.",
  diagnosticsSection: "Diagnostics",
  debugLogging: "Debug logging",
  debugLoggingDescription: "Write detailed stage logs to the extension log.",
  developerMode: "Developer mode",
  developerModeOn: "Developer mode is on. Run logs are visible in the settings list.",
  developerModeEnabled: "Developer mode enabled.",
  developerModeDisabled: "Developer mode disabled."
};
var LAUNCHER_LABELS = {
  title: "Inlay Illustrator",
  subtitle: "Asset Maid scene illustration and character assets (work in progress).",
  open: "Open Inlay Illustrator",
  status: "Status",
  inputBarLabel: "Inlay Illustrator",
  inputBarSubtitle: "Open the Asset Maid workspace"
};

// src/frontend/overlay/host.ts
function createOverlayHost(ui, doc, onFallback) {
  try {
    const handle = ui.mountApp({ position: "app-overlay", className: "ii-am-host" });
    handle.setVisible(false);
    return {
      kind: "app-overlay",
      container: handle.root,
      setVisible: (visible) => handle.setVisible(visible),
      destroy: () => handle.destroy()
    };
  } catch (error) {
    onFallback?.("float-widget", error);
  }
  try {
    const widget = ui.createFloatWidget({ fullscreen: true, chromeless: true, snapToEdge: false, tooltip: SHELL_LABELS.appName });
    widget.setVisible(false);
    return {
      kind: "float-widget",
      container: widget.root,
      setVisible: (visible) => {
        widget.setVisible(visible);
        if (visible && !widget.isFullscreen())
          widget.setFullscreen(true);
      },
      destroy: () => widget.destroy()
    };
  } catch (error) {
    onFallback?.("body", error);
  }
  const node = doc.createElement("div");
  node.setAttribute("data-ii-am-host", "body");
  node.hidden = true;
  doc.body.appendChild(node);
  return {
    kind: "body",
    container: node,
    setVisible: (visible) => {
      node.hidden = !visible;
    },
    destroy: () => node.remove()
  };
}

// node_modules/preact/hooks/dist/hooks.mjs
var t2;
var r2;
var u2;
var i2;
var o2 = Object.is;
var f2 = 0;
var c2 = [];
var e2 = [];
var a2 = n;
var v2 = a2.__b;
var l2 = a2.__r;
var m = a2.diffed;
var s2 = a2.__c;
var h2 = a2.unmount;
var p2 = a2.__;
function y2(n, t) {
  a2.__h && a2.__h(r2, n, f2 || t), f2 = 0;
  var u = r2.__H || (r2.__H = { __: [], __h: [] });
  return n >= u.__.length && u.__.push({}), u.__[n];
}
function d2(n) {
  return f2 = 1, _2(G2, n);
}
function _2(n, u, i) {
  var f = y2(t2++, 2);
  if (f.t = n, !f.__c && (f.__ = [i ? i(u) : G2(undefined, u), function(n) {
    var t = f.__N ? f.__N[0] : f.__[0], r = f.t(t, n);
    o2(t, r) || (f.__N = [r, f.__[1]], f.__c.setState({}));
  }], f.__c = r2, !r2.__f)) {
    r2.__f = true;
    var c = r2.shouldComponentUpdate;
    r2.shouldComponentUpdate = function(n, t, r) {
      var u = this.__H;
      if (!u)
        return true;
      var i = false, f = this.props != n;
      if (u.__.some(function(n) {
        n.__N && (i = true, o2(n.__[0], n.__N[0]) || (f = true));
      }), c) {
        var e = c.call(this, n, t, r);
        return i ? e || f : e;
      }
      return !i || f;
    };
  }
  return f.__;
}
function A2(n, u) {
  var i = y2(t2++, 3);
  !a2.__s && E2(i.__H, u) && (i.__P = true, i.__ = n, i.u = u, r2.__H.__h.push(i));
}
function F2(n, u) {
  var i = y2(t2++, 4);
  !a2.__s && E2(i.__H, u) && (i.__P = false, i.__ = n, i.u = u, r2.__h.push(i));
}
function T2(n) {
  return f2 = 5, b2(function() {
    return { current: n };
  }, []);
}
function b2(n, r) {
  var u = y2(t2++, 7);
  return E2(u.__H, r) && (u.__ = n(), u.__H = r), u.__;
}
function j2(n, t) {
  return f2 = 8, b2(function() {
    return n;
  }, t);
}
function w2(n) {
  var u = r2.context[n.__c], i = y2(t2++, 9);
  return i.c = n, u ? (i.__ == null && (i.__ = true, u.sub(r2)), u.props.value) : n.__;
}
function P() {
  var n = y2(t2++, 11);
  if (!n.__) {
    for (var u = r2.__v;!u.__m && u.__; )
      u = u.__;
    var i = u.__m || (u.__m = [0, 0]);
    n.__ = "P" + i[0] + "-" + i[1]++;
  }
  return n.__;
}
function g2() {
  var n;
  do {
    for (;n = e2.shift(); )
      try {
        C2(n);
      } catch (t) {
        a2.__e(t, { __: (n = n.__P) && n.__v });
      }
    for (;n = c2.shift(); ) {
      var t = n.__H;
      if (n.__P && t)
        try {
          t.__h.some(C2), t.__h.some(D2), t.__h = [];
        } catch (r) {
          t.__h = [], a2.__e(r, n.__v);
        }
    }
  } while (e2.length);
}
a2.__b = function(n) {
  r2 = null, v2 && v2(n);
}, a2.__ = function(n, t) {
  n && t.__k && t.__k.__m && (n.__m = t.__k.__m), p2 && p2(n, t);
}, a2.__r = function(n) {
  l2 && l2(n), t2 = 0;
  var i = (r2 = n.__c).__H;
  i && (u2 == r2 ? r2.__h = [] : (i.__h.some(C2), i.__h.some(D2), t2 = 0), i.__h = [], i.__.some(function(n) {
    n.__N && (n.__ = n.__N), n.u = n.__N = undefined;
  })), u2 = r2;
}, a2.diffed = function(n) {
  m && m(n);
  var t = n.__c;
  t && t.__H && (t.__H.__h.length && B2(c2.push(t)), t.__H.__.some(function(n) {
    n.u && (n.__H = n.u);
  })), u2 = r2 = null;
}, a2.__c = function(n, t) {
  t.some(function(n) {
    try {
      n.__h.some(C2), n.__h = n.__h.filter(function(n) {
        return !n.__ || D2(n);
      });
    } catch (r) {
      t.some(function(n) {
        n.__h && (n.__h = []);
      }), t = [], a2.__e(r, n.__v);
    }
  }), s2 && s2(n, t);
}, a2.unmount = function(n) {
  h2 && h2(n);
  var t, r, u = n.__c;
  u && u.__H && (u.__H.__.some(function(u) {
    try {
      if (u.__P && u.__c) {
        if (r === undefined) {
          for (r = n.__;r && (!r.__c || !r.__c.__P); )
            r = r.__;
          r = r && r.__c;
        }
        u.__P = r, B2(e2.push(u));
      } else
        C2(u);
    } catch (n) {
      t = n;
    }
  }), u.__H = undefined, t && a2.__e(t, u.__v));
};
var k = typeof requestAnimationFrame == "function";
function z2(n) {
  var t, r = function() {
    clearTimeout(u), k && cancelAnimationFrame(t), setTimeout(n);
  }, u = setTimeout(r, 35);
  k && (t = requestAnimationFrame(r));
}
function B2(n) {
  n != 1 && i2 == a2.requestAnimationFrame || ((i2 = a2.requestAnimationFrame) || z2)(g2);
}
function C2(n) {
  var t = r2, u = n.__c;
  typeof u == "function" && (n.__c = undefined, u()), r2 = t;
}
function D2(n) {
  var t = r2;
  n.__c = n.__(), r2 = t;
}
function E2(n, t) {
  return !n || n.length != t.length || t.some(function(t, r) {
    return !o2(t, n[r]);
  });
}
function G2(n, t) {
  return typeof t == "function" ? t(n) : t;
}
// node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs
var o3 = 0;
function u3(t, e, n2, f, u, i) {
  e || (e = {});
  var a, c, l = e;
  if ("ref" in l && typeof t != "function")
    for (c in l = {}, e)
      c == "ref" ? a = e[c] : l[c] = e[c];
  var p = { type: t, props: l, key: n2, ref: a, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: undefined, __v: --o3, __i: -1, __u: 0 };
  return (u || i) && (p.__source = u, p.__self = i), n.vnode && n.vnode(p), p;
}

// src/frontend/overlay/placeholder.tsx
function Placeholder({ children }) {
  return /* @__PURE__ */ u3("div", {
    class: "grid gap-1.5 rounded-lg bg-card p-4",
    children: [
      children ? /* @__PURE__ */ u3("p", {
        class: "text-xs font-bold",
        children
      }) : null,
      /* @__PURE__ */ u3("p", {
        class: "text-xs leading-relaxed text-muted-foreground",
        children: SHELL_LABELS.placeholderNote
      })
    ]
  });
}

// node_modules/tailwind-merge/dist/bundle-mjs.mjs
var concatArrays = (array1, array2) => {
  const combinedArray = new Array(array1.length + array2.length);
  for (let i = 0;i < array1.length; i++) {
    combinedArray[i] = array1[i];
  }
  for (let i = 0;i < array2.length; i++) {
    combinedArray[array1.length + i] = array2[i];
  }
  return combinedArray;
};
var createClassValidatorObject = (classGroupId, validator) => ({
  classGroupId,
  validator
});
var createClassPartObject = (nextPart = new Map, validators = null, classGroupId) => ({
  nextPart,
  validators,
  classGroupId
});
var CLASS_PART_SEPARATOR = "-";
var EMPTY_CONFLICTS = [];
var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
var createClassGroupUtils = (config) => {
  const classMap = createClassMap(config);
  const {
    conflictingClassGroups,
    conflictingClassGroupModifiers
  } = config;
  const getClassGroupId = (className) => {
    if (className.startsWith("[") && className.endsWith("]")) {
      return getGroupIdForArbitraryProperty(className);
    }
    const classParts = className.split(CLASS_PART_SEPARATOR);
    const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
    return getGroupRecursive(classParts, startIndex, classMap);
  };
  const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
    if (hasPostfixModifier) {
      const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
      const baseConflicts = conflictingClassGroups[classGroupId];
      if (modifierConflicts) {
        if (baseConflicts) {
          return concatArrays(baseConflicts, modifierConflicts);
        }
        return modifierConflicts;
      }
      return baseConflicts || EMPTY_CONFLICTS;
    }
    return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
  };
  return {
    getClassGroupId,
    getConflictingClassGroupIds
  };
};
var getGroupRecursive = (classParts, startIndex, classPartObject) => {
  const classPathsLength = classParts.length - startIndex;
  if (classPathsLength === 0) {
    return classPartObject.classGroupId;
  }
  const currentClassPart = classParts[startIndex];
  const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
  if (nextClassPartObject) {
    const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
    if (result)
      return result;
  }
  const validators = classPartObject.validators;
  if (validators === null) {
    return;
  }
  const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
  const validatorsLength = validators.length;
  for (let i = 0;i < validatorsLength; i++) {
    const validatorObj = validators[i];
    if (validatorObj.validator(classRest)) {
      return validatorObj.classGroupId;
    }
  }
  return;
};
var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? undefined : (() => {
  const content = className.slice(1, -1);
  const colonIndex = content.indexOf(":");
  const property = content.slice(0, colonIndex);
  return property ? ARBITRARY_PROPERTY_PREFIX + property : undefined;
})();
var createClassMap = (config) => {
  const {
    theme,
    classGroups
  } = config;
  return processClassGroups(classGroups, theme);
};
var processClassGroups = (classGroups, theme) => {
  const classMap = createClassPartObject();
  for (const classGroupId in classGroups) {
    const group = classGroups[classGroupId];
    processClassesRecursively(group, classMap, classGroupId, theme);
  }
  return classMap;
};
var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
  const len = classGroup.length;
  for (let i = 0;i < len; i++) {
    const classDefinition = classGroup[i];
    processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
  }
};
var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  if (typeof classDefinition === "string") {
    processStringDefinition(classDefinition, classPartObject, classGroupId);
    return;
  }
  if (typeof classDefinition === "function") {
    processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
    return;
  }
  processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
};
var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
  const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
  classPartObjectToEdit.classGroupId = classGroupId;
};
var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  if (isThemeGetter(classDefinition)) {
    processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
    return;
  }
  if (classPartObject.validators === null) {
    classPartObject.validators = [];
  }
  classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
};
var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  const entries = Object.entries(classDefinition);
  const len = entries.length;
  for (let i = 0;i < len; i++) {
    const [key, value] = entries[i];
    processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
  }
};
var getPart = (classPartObject, path) => {
  let current = classPartObject;
  const parts = path.split(CLASS_PART_SEPARATOR);
  const len = parts.length;
  for (let i = 0;i < len; i++) {
    const part = parts[i];
    let next = current.nextPart.get(part);
    if (!next) {
      next = createClassPartObject();
      current.nextPart.set(part, next);
    }
    current = next;
  }
  return current;
};
var isThemeGetter = (func) => ("isThemeGetter" in func) && func.isThemeGetter === true;
var createLruCache = (maxCacheSize) => {
  if (maxCacheSize < 1) {
    return {
      get: () => {
        return;
      },
      set: () => {}
    };
  }
  let cacheSize = 0;
  let cache = Object.create(null);
  let previousCache = Object.create(null);
  const update = (key, value) => {
    cache[key] = value;
    cacheSize++;
    if (cacheSize > maxCacheSize) {
      cacheSize = 0;
      previousCache = cache;
      cache = Object.create(null);
    }
  };
  return {
    get(key) {
      let value = cache[key];
      if (value !== undefined) {
        return value;
      }
      if ((value = previousCache[key]) !== undefined) {
        update(key, value);
        return value;
      }
    },
    set(key, value) {
      if (key in cache) {
        cache[key] = value;
      } else {
        update(key, value);
      }
    }
  };
};
var IMPORTANT_MODIFIER = "!";
var MODIFIER_SEPARATOR = ":";
var EMPTY_MODIFIERS = [];
var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
  modifiers,
  hasImportantModifier,
  baseClassName,
  maybePostfixModifierPosition,
  isExternal
});
var createParseClassName = (config) => {
  const {
    prefix,
    experimentalParseClassName
  } = config;
  let parseClassName = (className) => {
    const modifiers = [];
    let bracketDepth = 0;
    let parenDepth = 0;
    let modifierStart = 0;
    let postfixModifierPosition;
    const len = className.length;
    for (let index = 0;index < len; index++) {
      const currentCharacter = className[index];
      if (bracketDepth === 0 && parenDepth === 0) {
        if (currentCharacter === MODIFIER_SEPARATOR) {
          modifiers.push(className.slice(modifierStart, index));
          modifierStart = index + 1;
          continue;
        }
        if (currentCharacter === "/") {
          postfixModifierPosition = index;
          continue;
        }
      }
      if (currentCharacter === "[")
        bracketDepth++;
      else if (currentCharacter === "]")
        bracketDepth--;
      else if (currentCharacter === "(")
        parenDepth++;
      else if (currentCharacter === ")")
        parenDepth--;
    }
    const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
    let baseClassName = baseClassNameWithImportantModifier;
    let hasImportantModifier = false;
    if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
      baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
      hasImportantModifier = true;
    } else if (baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)) {
      baseClassName = baseClassNameWithImportantModifier.slice(1);
      hasImportantModifier = true;
    }
    const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : undefined;
    return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
  };
  if (prefix) {
    const fullPrefix = prefix + MODIFIER_SEPARATOR;
    const parseClassNameOriginal = parseClassName;
    parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, undefined, true);
  }
  if (experimentalParseClassName) {
    const parseClassNameOriginal = parseClassName;
    parseClassName = (className) => experimentalParseClassName({
      className,
      parseClassName: parseClassNameOriginal
    });
  }
  return parseClassName;
};
var createSortModifiers = (config) => {
  const modifierWeights = new Map;
  config.orderSensitiveModifiers.forEach((mod, index) => {
    modifierWeights.set(mod, 1e6 + index);
  });
  return (modifiers) => {
    const result = [];
    let currentSegment = [];
    for (let i = 0;i < modifiers.length; i++) {
      const modifier = modifiers[i];
      const isArbitrary = modifier[0] === "[";
      const isOrderSensitive = modifierWeights.has(modifier);
      if (isArbitrary || isOrderSensitive) {
        if (currentSegment.length > 0) {
          currentSegment.sort();
          result.push(...currentSegment);
          currentSegment = [];
        }
        result.push(modifier);
      } else {
        currentSegment.push(modifier);
      }
    }
    if (currentSegment.length > 0) {
      currentSegment.sort();
      result.push(...currentSegment);
    }
    return result;
  };
};
var createConfigUtils = (config) => ({
  cache: createLruCache(config.cacheSize),
  parseClassName: createParseClassName(config),
  sortModifiers: createSortModifiers(config),
  postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
  ...createClassGroupUtils(config)
});
var createPostfixLookupClassGroupIds = (config) => {
  const lookup = Object.create(null);
  const classGroupIds = config.postfixLookupClassGroups;
  if (classGroupIds) {
    for (let i = 0;i < classGroupIds.length; i++) {
      lookup[classGroupIds[i]] = true;
    }
  }
  return lookup;
};
var SPLIT_CLASSES_REGEX = /\s+/;
var mergeClassList = (classList, configUtils) => {
  const {
    parseClassName,
    getClassGroupId,
    getConflictingClassGroupIds,
    sortModifiers,
    postfixLookupClassGroupIds
  } = configUtils;
  const classGroupsInConflict = [];
  const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
  let result = "";
  for (let index = classNames.length - 1;index >= 0; index -= 1) {
    const originalClassName = classNames[index];
    const {
      isExternal,
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    } = parseClassName(originalClassName);
    if (isExternal) {
      result = originalClassName + (result.length > 0 ? " " + result : result);
      continue;
    }
    let hasPostfixModifier = !!maybePostfixModifierPosition;
    let classGroupId;
    if (hasPostfixModifier) {
      const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
      classGroupId = getClassGroupId(baseClassNameWithoutPostfix);
      const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : undefined;
      if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
        classGroupId = classGroupIdWithPostfix;
        hasPostfixModifier = false;
      }
    } else {
      classGroupId = getClassGroupId(baseClassName);
    }
    if (!classGroupId) {
      if (!hasPostfixModifier) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      classGroupId = getClassGroupId(baseClassName);
      if (!classGroupId) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      hasPostfixModifier = false;
    }
    const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
    const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
    const classId = modifierId + classGroupId;
    if (classGroupsInConflict.indexOf(classId) > -1) {
      continue;
    }
    classGroupsInConflict.push(classId);
    const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
    for (let i = 0;i < conflictGroups.length; ++i) {
      const group = conflictGroups[i];
      classGroupsInConflict.push(modifierId + group);
    }
    result = originalClassName + (result.length > 0 ? " " + result : result);
  }
  return result;
};
var twJoin = (...classLists) => {
  let index = 0;
  let argument;
  let resolvedValue;
  let string = "";
  while (index < classLists.length) {
    if (argument = classLists[index++]) {
      if (resolvedValue = toValue(argument)) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
};
var toValue = (mix) => {
  if (typeof mix === "string") {
    return mix;
  }
  let resolvedValue;
  let string = "";
  for (let k = 0;k < mix.length; k++) {
    if (mix[k]) {
      if (resolvedValue = toValue(mix[k])) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
};
var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
  let configUtils;
  let cacheGet;
  let cacheSet;
  let functionToCall;
  const initTailwindMerge = (classList) => {
    const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
    configUtils = createConfigUtils(config);
    cacheGet = configUtils.cache.get;
    cacheSet = configUtils.cache.set;
    functionToCall = tailwindMerge;
    return tailwindMerge(classList);
  };
  const tailwindMerge = (classList) => {
    const cachedResult = cacheGet(classList);
    if (cachedResult) {
      return cachedResult;
    }
    const result = mergeClassList(classList, configUtils);
    cacheSet(classList, result);
    return result;
  };
  functionToCall = initTailwindMerge;
  return (...args) => functionToCall(twJoin(...args));
};
var fallbackThemeArr = [];
var fromTheme = (key) => {
  const themeGetter = (theme) => theme[key] || fallbackThemeArr;
  themeGetter.isThemeGetter = true;
  themeGetter.themeKey = key;
  return themeGetter;
};
var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/;
var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
var isFraction = (value) => fractionRegex.test(value);
var isNumber = (value) => !!value && !Number.isNaN(Number(value));
var isInteger = (value) => !!value && Number.isInteger(Number(value));
var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
var isTshirtSize = (value) => tshirtUnitRegex.test(value);
var isAny = () => true;
var isLengthOnly = (value) => lengthUnitRegex.test(value) && !colorFunctionRegex.test(value);
var isNever = () => false;
var isShadow = (value) => shadowRegex.test(value);
var isImage = (value) => imageRegex.test(value);
var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
var isNamedContainerQuery = (value) => value.startsWith("@container") && (value[10] === "/" && value[11] !== undefined || value[11] === "s" && value[16] !== undefined && value.startsWith("-size/", 10) || value[11] === "n" && value[18] !== undefined && value.startsWith("-normal/", 10));
var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
var getIsArbitraryValue = (value, testLabel, testValue) => {
  const result = arbitraryValueRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return testValue(result[2]);
  }
  return false;
};
var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
  const result = arbitraryVariableRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return shouldMatchNoLabel;
  }
  return false;
};
var isLabelPosition = (label) => label === "position" || label === "percentage";
var isLabelImage = (label) => label === "image" || label === "url";
var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
var isLabelLength = (label) => label === "length";
var isLabelNumber = (label) => label === "number";
var isLabelFamilyName = (label) => label === "family-name";
var isLabelWeight = (label) => label === "number" || label === "weight";
var isLabelShadow = (label) => label === "shadow";
var getDefaultConfig = () => {
  const themeColor = fromTheme("color");
  const themeFont = fromTheme("font");
  const themeText = fromTheme("text");
  const themeFontWeight = fromTheme("font-weight");
  const themeTracking = fromTheme("tracking");
  const themeLeading = fromTheme("leading");
  const themeBreakpoint = fromTheme("breakpoint");
  const themeContainer = fromTheme("container");
  const themeSpacing = fromTheme("spacing");
  const themeRadius = fromTheme("radius");
  const themeShadow = fromTheme("shadow");
  const themeInsetShadow = fromTheme("inset-shadow");
  const themeTextShadow = fromTheme("text-shadow");
  const themeDropShadow = fromTheme("drop-shadow");
  const themeBlur = fromTheme("blur");
  const themePerspective = fromTheme("perspective");
  const themeAspect = fromTheme("aspect");
  const themeEase = fromTheme("ease");
  const themeAnimate = fromTheme("animate");
  const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
  const scalePosition = () => [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    "left-top",
    "top-right",
    "right-top",
    "bottom-right",
    "right-bottom",
    "bottom-left",
    "left-bottom"
  ];
  const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
  const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
  const scaleOverscroll = () => ["auto", "contain", "none"];
  const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
  const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
  const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartAndEnd = () => ["auto", {
    span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
  }, isInteger, isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
  const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
  const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
  const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
  const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
  const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
  const scaleSizingInline = () => [themeContainer, isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
  const scaleSizingBlock = () => [isFraction, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
  const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
  const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
    position: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleBgRepeat = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }];
  const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
    size: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
  const scaleRadius = () => [
    "",
    "none",
    "full",
    themeRadius,
    isArbitraryVariable,
    isArbitraryValue
  ];
  const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
  const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
  const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
  const scaleBlur = () => [
    "",
    "none",
    themeBlur,
    isArbitraryVariable,
    isArbitraryValue
  ];
  const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [isTshirtSize],
      breakpoint: [isTshirtSize],
      color: [isAny],
      container: [isTshirtSize],
      "drop-shadow": [isTshirtSize],
      ease: ["in", "out", "in-out"],
      font: [isAnyNonArbitrary],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [isTshirtSize],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [isTshirtSize],
      shadow: [isTshirtSize],
      spacing: ["px", isNumber],
      text: [isTshirtSize],
      "text-shadow": [isTshirtSize],
      tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
    },
    classGroups: {
      aspect: [{
        aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
      }],
      container: ["container"],
      "container-type": [{
        "@container": ["", "normal", "size", isArbitraryVariable, isArbitraryValue]
      }],
      "container-named": [isNamedContainerQuery],
      columns: [{
        columns: [isNumber, "auto", isArbitraryValue, isArbitraryVariable, themeContainer]
      }],
      "break-after": [{
        "break-after": scaleBreak()
      }],
      "break-before": [{
        "break-before": scaleBreak()
      }],
      "break-inside": [{
        "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
      }],
      "box-decoration": [{
        "box-decoration": ["slice", "clone"]
      }],
      box: [{
        box: ["border", "content"]
      }],
      display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
      sr: ["sr-only", "not-sr-only"],
      float: [{
        float: ["right", "left", "none", "start", "end"]
      }],
      clear: [{
        clear: ["left", "right", "both", "none", "start", "end"]
      }],
      isolation: ["isolate", "isolation-auto"],
      "object-fit": [{
        object: ["contain", "cover", "fill", "none", "scale-down"]
      }],
      "object-position": [{
        object: scalePositionWithArbitrary()
      }],
      overflow: [{
        overflow: scaleOverflow()
      }],
      "overflow-x": [{
        "overflow-x": scaleOverflow()
      }],
      "overflow-y": [{
        "overflow-y": scaleOverflow()
      }],
      overscroll: [{
        overscroll: scaleOverscroll()
      }],
      "overscroll-x": [{
        "overscroll-x": scaleOverscroll()
      }],
      "overscroll-y": [{
        "overscroll-y": scaleOverscroll()
      }],
      position: ["static", "fixed", "absolute", "relative", "sticky"],
      inset: [{
        inset: scaleInset()
      }],
      "inset-x": [{
        "inset-x": scaleInset()
      }],
      "inset-y": [{
        "inset-y": scaleInset()
      }],
      start: [{
        "inset-s": scaleInset(),
        start: scaleInset()
      }],
      end: [{
        "inset-e": scaleInset(),
        end: scaleInset()
      }],
      "inset-bs": [{
        "inset-bs": scaleInset()
      }],
      "inset-be": [{
        "inset-be": scaleInset()
      }],
      top: [{
        top: scaleInset()
      }],
      right: [{
        right: scaleInset()
      }],
      bottom: [{
        bottom: scaleInset()
      }],
      left: [{
        left: scaleInset()
      }],
      visibility: ["visible", "invisible", "collapse"],
      z: [{
        z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
      }],
      basis: [{
        basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
      }],
      "flex-direction": [{
        flex: ["row", "row-reverse", "col", "col-reverse"]
      }],
      "flex-wrap": [{
        flex: ["nowrap", "wrap", "wrap-reverse"]
      }],
      flex: [{
        flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
      }],
      grow: [{
        grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      shrink: [{
        shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      order: [{
        order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
      }],
      "grid-cols": [{
        "grid-cols": scaleGridTemplateColsRows()
      }],
      "col-start-end": [{
        col: scaleGridColRowStartAndEnd()
      }],
      "col-start": [{
        "col-start": scaleGridColRowStartOrEnd()
      }],
      "col-end": [{
        "col-end": scaleGridColRowStartOrEnd()
      }],
      "grid-rows": [{
        "grid-rows": scaleGridTemplateColsRows()
      }],
      "row-start-end": [{
        row: scaleGridColRowStartAndEnd()
      }],
      "row-start": [{
        "row-start": scaleGridColRowStartOrEnd()
      }],
      "row-end": [{
        "row-end": scaleGridColRowStartOrEnd()
      }],
      "grid-flow": [{
        "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
      }],
      "auto-cols": [{
        "auto-cols": scaleGridAutoColsRows()
      }],
      "auto-rows": [{
        "auto-rows": scaleGridAutoColsRows()
      }],
      gap: [{
        gap: scaleUnambiguousSpacing()
      }],
      "gap-x": [{
        "gap-x": scaleUnambiguousSpacing()
      }],
      "gap-y": [{
        "gap-y": scaleUnambiguousSpacing()
      }],
      "justify-content": [{
        justify: [...scaleAlignPrimaryAxis(), "normal"]
      }],
      "justify-items": [{
        "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
      }],
      "justify-self": [{
        "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
      }],
      "align-content": [{
        content: ["normal", ...scaleAlignPrimaryAxis()]
      }],
      "align-items": [{
        items: [...scaleAlignSecondaryAxis(), {
          baseline: ["", "last"]
        }]
      }],
      "align-self": [{
        self: ["auto", ...scaleAlignSecondaryAxis(), {
          baseline: ["", "last"]
        }]
      }],
      "place-content": [{
        "place-content": scaleAlignPrimaryAxis()
      }],
      "place-items": [{
        "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
      }],
      "place-self": [{
        "place-self": ["auto", ...scaleAlignSecondaryAxis()]
      }],
      p: [{
        p: scaleUnambiguousSpacing()
      }],
      px: [{
        px: scaleUnambiguousSpacing()
      }],
      py: [{
        py: scaleUnambiguousSpacing()
      }],
      ps: [{
        ps: scaleUnambiguousSpacing()
      }],
      pe: [{
        pe: scaleUnambiguousSpacing()
      }],
      pbs: [{
        pbs: scaleUnambiguousSpacing()
      }],
      pbe: [{
        pbe: scaleUnambiguousSpacing()
      }],
      pt: [{
        pt: scaleUnambiguousSpacing()
      }],
      pr: [{
        pr: scaleUnambiguousSpacing()
      }],
      pb: [{
        pb: scaleUnambiguousSpacing()
      }],
      pl: [{
        pl: scaleUnambiguousSpacing()
      }],
      m: [{
        m: scaleMargin()
      }],
      mx: [{
        mx: scaleMargin()
      }],
      my: [{
        my: scaleMargin()
      }],
      ms: [{
        ms: scaleMargin()
      }],
      me: [{
        me: scaleMargin()
      }],
      mbs: [{
        mbs: scaleMargin()
      }],
      mbe: [{
        mbe: scaleMargin()
      }],
      mt: [{
        mt: scaleMargin()
      }],
      mr: [{
        mr: scaleMargin()
      }],
      mb: [{
        mb: scaleMargin()
      }],
      ml: [{
        ml: scaleMargin()
      }],
      "space-x": [{
        "space-x": scaleUnambiguousSpacing()
      }],
      "space-x-reverse": ["space-x-reverse"],
      "space-y": [{
        "space-y": scaleUnambiguousSpacing()
      }],
      "space-y-reverse": ["space-y-reverse"],
      size: [{
        size: scaleSizing()
      }],
      "inline-size": [{
        inline: ["auto", ...scaleSizingInline()]
      }],
      "min-inline-size": [{
        "min-inline": ["auto", ...scaleSizingInline()]
      }],
      "max-inline-size": [{
        "max-inline": ["none", ...scaleSizingInline()]
      }],
      "block-size": [{
        block: ["auto", ...scaleSizingBlock()]
      }],
      "min-block-size": [{
        "min-block": ["auto", ...scaleSizingBlock()]
      }],
      "max-block-size": [{
        "max-block": ["none", ...scaleSizingBlock()]
      }],
      w: [{
        w: [themeContainer, "screen", ...scaleSizing()]
      }],
      "min-w": [{
        "min-w": [
          themeContainer,
          "screen",
          "none",
          ...scaleSizing()
        ]
      }],
      "max-w": [{
        "max-w": [
          themeContainer,
          "screen",
          "none",
          "prose",
          {
            screen: [themeBreakpoint]
          },
          ...scaleSizing()
        ]
      }],
      h: [{
        h: ["screen", "lh", ...scaleSizing()]
      }],
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...scaleSizing()]
      }],
      "max-h": [{
        "max-h": ["screen", "lh", "none", ...scaleSizing()]
      }],
      "font-size": [{
        text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
      }],
      "font-smoothing": ["antialiased", "subpixel-antialiased"],
      "font-style": ["italic", "not-italic"],
      "font-weight": [{
        font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
      }],
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
      }],
      "font-family": [{
        font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
      }],
      "font-features": [{
        "font-features": [isArbitraryValue]
      }],
      "fvn-normal": ["normal-nums"],
      "fvn-ordinal": ["ordinal"],
      "fvn-slashed-zero": ["slashed-zero"],
      "fvn-figure": ["lining-nums", "oldstyle-nums"],
      "fvn-spacing": ["proportional-nums", "tabular-nums"],
      "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
      tracking: [{
        tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
      }],
      "line-clamp": [{
        "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
      }],
      leading: [{
        leading: [
          "none",
          themeLeading,
          ...scaleUnambiguousSpacing()
        ]
      }],
      "list-image": [{
        "list-image": ["none", isArbitraryVariable, isArbitraryValue]
      }],
      "list-style-position": [{
        list: ["inside", "outside"]
      }],
      "list-style-type": [{
        list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
      }],
      "text-alignment": [{
        text: ["left", "center", "right", "justify", "start", "end"]
      }],
      "placeholder-color": [{
        placeholder: scaleColor()
      }],
      "text-color": [{
        text: scaleColor()
      }],
      "text-decoration": ["underline", "overline", "line-through", "no-underline"],
      "text-decoration-style": [{
        decoration: [...scaleLineStyle(), "wavy"]
      }],
      "text-decoration-thickness": [{
        decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
      }],
      "text-decoration-color": [{
        decoration: scaleColor()
      }],
      "underline-offset": [{
        "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
      }],
      "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
      "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
      "text-wrap": [{
        text: ["wrap", "nowrap", "balance", "pretty"]
      }],
      indent: [{
        indent: scaleUnambiguousSpacing()
      }],
      "tab-size": [{
        tab: [isInteger, isArbitraryVariable, isArbitraryValue]
      }],
      "vertical-align": [{
        align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
      }],
      whitespace: [{
        whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
      }],
      break: [{
        break: ["normal", "words", "all", "keep"]
      }],
      wrap: [{
        wrap: ["break-word", "anywhere", "normal"]
      }],
      hyphens: [{
        hyphens: ["none", "manual", "auto"]
      }],
      content: [{
        content: ["none", isArbitraryVariable, isArbitraryValue]
      }],
      "bg-attachment": [{
        bg: ["fixed", "local", "scroll"]
      }],
      "bg-clip": [{
        "bg-clip": ["border", "padding", "content", "text"]
      }],
      "bg-origin": [{
        "bg-origin": ["border", "padding", "content"]
      }],
      "bg-position": [{
        bg: scaleBgPosition()
      }],
      "bg-repeat": [{
        bg: scaleBgRepeat()
      }],
      "bg-size": [{
        bg: scaleBgSize()
      }],
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, isInteger, isArbitraryVariable, isArbitraryValue],
          radial: ["", isArbitraryVariable, isArbitraryValue],
          conic: ["", isInteger, isArbitraryVariable, isArbitraryValue]
        }, isArbitraryVariableImage, isArbitraryImage]
      }],
      "bg-color": [{
        bg: scaleColor()
      }],
      "gradient-from-pos": [{
        from: scaleGradientStopPosition()
      }],
      "gradient-via-pos": [{
        via: scaleGradientStopPosition()
      }],
      "gradient-to-pos": [{
        to: scaleGradientStopPosition()
      }],
      "gradient-from": [{
        from: scaleColor()
      }],
      "gradient-via": [{
        via: scaleColor()
      }],
      "gradient-to": [{
        to: scaleColor()
      }],
      rounded: [{
        rounded: scaleRadius()
      }],
      "rounded-s": [{
        "rounded-s": scaleRadius()
      }],
      "rounded-e": [{
        "rounded-e": scaleRadius()
      }],
      "rounded-t": [{
        "rounded-t": scaleRadius()
      }],
      "rounded-r": [{
        "rounded-r": scaleRadius()
      }],
      "rounded-b": [{
        "rounded-b": scaleRadius()
      }],
      "rounded-l": [{
        "rounded-l": scaleRadius()
      }],
      "rounded-ss": [{
        "rounded-ss": scaleRadius()
      }],
      "rounded-se": [{
        "rounded-se": scaleRadius()
      }],
      "rounded-ee": [{
        "rounded-ee": scaleRadius()
      }],
      "rounded-es": [{
        "rounded-es": scaleRadius()
      }],
      "rounded-tl": [{
        "rounded-tl": scaleRadius()
      }],
      "rounded-tr": [{
        "rounded-tr": scaleRadius()
      }],
      "rounded-br": [{
        "rounded-br": scaleRadius()
      }],
      "rounded-bl": [{
        "rounded-bl": scaleRadius()
      }],
      "border-w": [{
        border: scaleBorderWidth()
      }],
      "border-w-x": [{
        "border-x": scaleBorderWidth()
      }],
      "border-w-y": [{
        "border-y": scaleBorderWidth()
      }],
      "border-w-s": [{
        "border-s": scaleBorderWidth()
      }],
      "border-w-e": [{
        "border-e": scaleBorderWidth()
      }],
      "border-w-bs": [{
        "border-bs": scaleBorderWidth()
      }],
      "border-w-be": [{
        "border-be": scaleBorderWidth()
      }],
      "border-w-t": [{
        "border-t": scaleBorderWidth()
      }],
      "border-w-r": [{
        "border-r": scaleBorderWidth()
      }],
      "border-w-b": [{
        "border-b": scaleBorderWidth()
      }],
      "border-w-l": [{
        "border-l": scaleBorderWidth()
      }],
      "divide-x": [{
        "divide-x": scaleBorderWidth()
      }],
      "divide-x-reverse": ["divide-x-reverse"],
      "divide-y": [{
        "divide-y": scaleBorderWidth()
      }],
      "divide-y-reverse": ["divide-y-reverse"],
      "border-style": [{
        border: [...scaleLineStyle(), "hidden", "none"]
      }],
      "divide-style": [{
        divide: [...scaleLineStyle(), "hidden", "none"]
      }],
      "border-color": [{
        border: scaleColor()
      }],
      "border-color-x": [{
        "border-x": scaleColor()
      }],
      "border-color-y": [{
        "border-y": scaleColor()
      }],
      "border-color-s": [{
        "border-s": scaleColor()
      }],
      "border-color-e": [{
        "border-e": scaleColor()
      }],
      "border-color-bs": [{
        "border-bs": scaleColor()
      }],
      "border-color-be": [{
        "border-be": scaleColor()
      }],
      "border-color-t": [{
        "border-t": scaleColor()
      }],
      "border-color-r": [{
        "border-r": scaleColor()
      }],
      "border-color-b": [{
        "border-b": scaleColor()
      }],
      "border-color-l": [{
        "border-l": scaleColor()
      }],
      "divide-color": [{
        divide: scaleColor()
      }],
      "outline-style": [{
        outline: [...scaleLineStyle(), "none", "hidden"]
      }],
      "outline-offset": [{
        "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "outline-w": [{
        outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
      }],
      "outline-color": [{
        outline: scaleColor()
      }],
      shadow: [{
        shadow: [
          "",
          "inner",
          "none",
          themeShadow,
          isArbitraryVariableShadow,
          isArbitraryShadow
        ]
      }],
      "shadow-color": [{
        shadow: scaleColor()
      }],
      "inset-shadow": [{
        "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      "inset-shadow-color": [{
        "inset-shadow": scaleColor()
      }],
      "ring-w": [{
        ring: scaleBorderWidth()
      }],
      "ring-w-inset": ["ring-inset"],
      "ring-color": [{
        ring: scaleColor()
      }],
      "ring-offset-w": [{
        "ring-offset": [isNumber, isArbitraryLength]
      }],
      "ring-offset-color": [{
        "ring-offset": scaleColor()
      }],
      "inset-ring-w": [{
        "inset-ring": scaleBorderWidth()
      }],
      "inset-ring-color": [{
        "inset-ring": scaleColor()
      }],
      "text-shadow": [{
        "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      "text-shadow-color": [{
        "text-shadow": scaleColor()
      }],
      opacity: [{
        opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "mix-blend": [{
        "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
      }],
      "bg-blend": [{
        "bg-blend": scaleBlendMode()
      }],
      "mask-clip": [{
        "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
      }, "mask-no-clip"],
      "mask-composite": [{
        mask: ["add", "subtract", "intersect", "exclude"]
      }],
      "mask-image-linear-pos": [{
        "mask-linear": [isNumber]
      }],
      "mask-image-linear-from-pos": [{
        "mask-linear-from": scaleMaskImagePosition()
      }],
      "mask-image-linear-to-pos": [{
        "mask-linear-to": scaleMaskImagePosition()
      }],
      "mask-image-linear-from-color": [{
        "mask-linear-from": scaleColor()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": scaleColor()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": scaleMaskImagePosition()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": scaleMaskImagePosition()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": scaleColor()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": scaleColor()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": scaleMaskImagePosition()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": scaleMaskImagePosition()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": scaleColor()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": scaleColor()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": scaleMaskImagePosition()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": scaleMaskImagePosition()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": scaleColor()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": scaleColor()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": scaleMaskImagePosition()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": scaleMaskImagePosition()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": scaleColor()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": scaleColor()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": scaleMaskImagePosition()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": scaleMaskImagePosition()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": scaleColor()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": scaleColor()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": scaleMaskImagePosition()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": scaleMaskImagePosition()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": scaleColor()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": scaleColor()
      }],
      "mask-image-radial": [{
        "mask-radial": [isArbitraryVariable, isArbitraryValue]
      }],
      "mask-image-radial-from-pos": [{
        "mask-radial-from": scaleMaskImagePosition()
      }],
      "mask-image-radial-to-pos": [{
        "mask-radial-to": scaleMaskImagePosition()
      }],
      "mask-image-radial-from-color": [{
        "mask-radial-from": scaleColor()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": scaleColor()
      }],
      "mask-image-radial-shape": [{
        "mask-radial": ["circle", "ellipse"]
      }],
      "mask-image-radial-size": [{
        "mask-radial": [{
          closest: ["side", "corner"],
          farthest: ["side", "corner"]
        }]
      }],
      "mask-image-radial-pos": [{
        "mask-radial-at": scalePosition()
      }],
      "mask-image-conic-pos": [{
        "mask-conic": [isNumber]
      }],
      "mask-image-conic-from-pos": [{
        "mask-conic-from": scaleMaskImagePosition()
      }],
      "mask-image-conic-to-pos": [{
        "mask-conic-to": scaleMaskImagePosition()
      }],
      "mask-image-conic-from-color": [{
        "mask-conic-from": scaleColor()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": scaleColor()
      }],
      "mask-mode": [{
        mask: ["alpha", "luminance", "match"]
      }],
      "mask-origin": [{
        "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
      }],
      "mask-position": [{
        mask: scaleBgPosition()
      }],
      "mask-repeat": [{
        mask: scaleBgRepeat()
      }],
      "mask-size": [{
        mask: scaleBgSize()
      }],
      "mask-type": [{
        "mask-type": ["alpha", "luminance"]
      }],
      "mask-image": [{
        mask: ["none", isArbitraryVariable, isArbitraryValue]
      }],
      filter: [{
        filter: [
          "",
          "none",
          isArbitraryVariable,
          isArbitraryValue
        ]
      }],
      blur: [{
        blur: scaleBlur()
      }],
      brightness: [{
        brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      contrast: [{
        contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "drop-shadow": [{
        "drop-shadow": [
          "",
          "none",
          themeDropShadow,
          isArbitraryVariableShadow,
          isArbitraryShadow
        ]
      }],
      "drop-shadow-color": [{
        "drop-shadow": scaleColor()
      }],
      grayscale: [{
        grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "hue-rotate": [{
        "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      invert: [{
        invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      saturate: [{
        saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      sepia: [{
        sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-filter": [{
        "backdrop-filter": [
          "",
          "none",
          isArbitraryVariable,
          isArbitraryValue
        ]
      }],
      "backdrop-blur": [{
        "backdrop-blur": scaleBlur()
      }],
      "backdrop-brightness": [{
        "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-contrast": [{
        "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-grayscale": [{
        "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-hue-rotate": [{
        "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-invert": [{
        "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-opacity": [{
        "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-saturate": [{
        "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "backdrop-sepia": [{
        "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      "border-collapse": [{
        border: ["collapse", "separate"]
      }],
      "border-spacing": [{
        "border-spacing": scaleUnambiguousSpacing()
      }],
      "border-spacing-x": [{
        "border-spacing-x": scaleUnambiguousSpacing()
      }],
      "border-spacing-y": [{
        "border-spacing-y": scaleUnambiguousSpacing()
      }],
      "table-layout": [{
        table: ["auto", "fixed"]
      }],
      caption: [{
        caption: ["top", "bottom"]
      }],
      transition: [{
        transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
      }],
      "transition-behavior": [{
        transition: ["normal", "discrete"]
      }],
      duration: [{
        duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
      }],
      ease: [{
        ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
      }],
      delay: [{
        delay: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      animate: [{
        animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
      }],
      backface: [{
        backface: ["hidden", "visible"]
      }],
      perspective: [{
        perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
      }],
      "perspective-origin": [{
        "perspective-origin": scalePositionWithArbitrary()
      }],
      rotate: [{
        rotate: scaleRotate()
      }],
      "rotate-x": [{
        "rotate-x": scaleRotate()
      }],
      "rotate-y": [{
        "rotate-y": scaleRotate()
      }],
      "rotate-z": [{
        "rotate-z": scaleRotate()
      }],
      scale: [{
        scale: scaleScale()
      }],
      "scale-x": [{
        "scale-x": scaleScale()
      }],
      "scale-y": [{
        "scale-y": scaleScale()
      }],
      "scale-z": [{
        "scale-z": scaleScale()
      }],
      "scale-3d": ["scale-3d"],
      skew: [{
        skew: scaleSkew()
      }],
      "skew-x": [{
        "skew-x": scaleSkew()
      }],
      "skew-y": [{
        "skew-y": scaleSkew()
      }],
      transform: [{
        transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
      }],
      "transform-origin": [{
        origin: scalePositionWithArbitrary()
      }],
      "transform-style": [{
        transform: ["3d", "flat"]
      }],
      translate: [{
        translate: scaleTranslate()
      }],
      "translate-x": [{
        "translate-x": scaleTranslate()
      }],
      "translate-y": [{
        "translate-y": scaleTranslate()
      }],
      "translate-z": [{
        "translate-z": scaleTranslate()
      }],
      "translate-none": ["translate-none"],
      zoom: [{
        zoom: [isInteger, isArbitraryVariable, isArbitraryValue]
      }],
      accent: [{
        accent: scaleColor()
      }],
      appearance: [{
        appearance: ["none", "auto"]
      }],
      "caret-color": [{
        caret: scaleColor()
      }],
      "color-scheme": [{
        scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
      }],
      cursor: [{
        cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
      }],
      "field-sizing": [{
        "field-sizing": ["fixed", "content"]
      }],
      "pointer-events": [{
        "pointer-events": ["auto", "none"]
      }],
      resize: [{
        resize: ["none", "", "y", "x"]
      }],
      "scroll-behavior": [{
        scroll: ["auto", "smooth"]
      }],
      "scrollbar-thumb-color": [{
        "scrollbar-thumb": scaleColor()
      }],
      "scrollbar-track-color": [{
        "scrollbar-track": scaleColor()
      }],
      "scrollbar-gutter": [{
        "scrollbar-gutter": ["auto", "stable", "both"]
      }],
      "scrollbar-w": [{
        scrollbar: ["auto", "thin", "none"]
      }],
      "scroll-m": [{
        "scroll-m": scaleUnambiguousSpacing()
      }],
      "scroll-mx": [{
        "scroll-mx": scaleUnambiguousSpacing()
      }],
      "scroll-my": [{
        "scroll-my": scaleUnambiguousSpacing()
      }],
      "scroll-ms": [{
        "scroll-ms": scaleUnambiguousSpacing()
      }],
      "scroll-me": [{
        "scroll-me": scaleUnambiguousSpacing()
      }],
      "scroll-mbs": [{
        "scroll-mbs": scaleUnambiguousSpacing()
      }],
      "scroll-mbe": [{
        "scroll-mbe": scaleUnambiguousSpacing()
      }],
      "scroll-mt": [{
        "scroll-mt": scaleUnambiguousSpacing()
      }],
      "scroll-mr": [{
        "scroll-mr": scaleUnambiguousSpacing()
      }],
      "scroll-mb": [{
        "scroll-mb": scaleUnambiguousSpacing()
      }],
      "scroll-ml": [{
        "scroll-ml": scaleUnambiguousSpacing()
      }],
      "scroll-p": [{
        "scroll-p": scaleUnambiguousSpacing()
      }],
      "scroll-px": [{
        "scroll-px": scaleUnambiguousSpacing()
      }],
      "scroll-py": [{
        "scroll-py": scaleUnambiguousSpacing()
      }],
      "scroll-ps": [{
        "scroll-ps": scaleUnambiguousSpacing()
      }],
      "scroll-pe": [{
        "scroll-pe": scaleUnambiguousSpacing()
      }],
      "scroll-pbs": [{
        "scroll-pbs": scaleUnambiguousSpacing()
      }],
      "scroll-pbe": [{
        "scroll-pbe": scaleUnambiguousSpacing()
      }],
      "scroll-pt": [{
        "scroll-pt": scaleUnambiguousSpacing()
      }],
      "scroll-pr": [{
        "scroll-pr": scaleUnambiguousSpacing()
      }],
      "scroll-pb": [{
        "scroll-pb": scaleUnambiguousSpacing()
      }],
      "scroll-pl": [{
        "scroll-pl": scaleUnambiguousSpacing()
      }],
      "snap-align": [{
        snap: ["start", "end", "center", "align-none"]
      }],
      "snap-stop": [{
        snap: ["normal", "always"]
      }],
      "snap-type": [{
        snap: ["none", "x", "y", "both"]
      }],
      "snap-strictness": [{
        snap: ["mandatory", "proximity"]
      }],
      touch: [{
        touch: ["auto", "none", "manipulation"]
      }],
      "touch-x": [{
        "touch-pan": ["x", "left", "right"]
      }],
      "touch-y": [{
        "touch-pan": ["y", "up", "down"]
      }],
      "touch-pz": ["touch-pinch-zoom"],
      select: [{
        select: ["none", "text", "all", "auto"]
      }],
      "will-change": [{
        "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
      }],
      fill: [{
        fill: ["none", ...scaleColor()]
      }],
      "stroke-w": [{
        stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
      }],
      stroke: [{
        stroke: ["none", ...scaleColor()]
      }],
      "forced-color-adjust": [{
        "forced-color-adjust": ["auto", "none"]
      }]
    },
    conflictingClassGroups: {
      "container-named": ["container-type"],
      overflow: ["overflow-x", "overflow-y"],
      overscroll: ["overscroll-x", "overscroll-y"],
      inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
      "inset-x": ["start", "end", "right", "left"],
      "inset-y": ["inset-bs", "inset-be", "top", "bottom"],
      flex: ["basis", "grow", "shrink"],
      gap: ["gap-x", "gap-y"],
      p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
      px: ["ps", "pe", "pr", "pl"],
      py: ["pbs", "pbe", "pt", "pb"],
      m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
      mx: ["ms", "me", "mr", "ml"],
      my: ["mbs", "mbe", "mt", "mb"],
      size: ["w", "h"],
      "font-size": ["leading"],
      "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
      "fvn-ordinal": ["fvn-normal"],
      "fvn-slashed-zero": ["fvn-normal"],
      "fvn-figure": ["fvn-normal"],
      "fvn-spacing": ["fvn-normal"],
      "fvn-fraction": ["fvn-normal"],
      "line-clamp": ["display", "overflow"],
      rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
      "rounded-s": ["rounded-ss", "rounded-es"],
      "rounded-e": ["rounded-se", "rounded-ee"],
      "rounded-t": ["rounded-tl", "rounded-tr"],
      "rounded-r": ["rounded-tr", "rounded-br"],
      "rounded-b": ["rounded-br", "rounded-bl"],
      "rounded-l": ["rounded-tl", "rounded-bl"],
      "border-spacing": ["border-spacing-x", "border-spacing-y"],
      "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
      "border-w-x": ["border-w-s", "border-w-e", "border-w-r", "border-w-l"],
      "border-w-y": ["border-w-bs", "border-w-be", "border-w-t", "border-w-b"],
      "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
      "border-color-x": ["border-color-s", "border-color-e", "border-color-r", "border-color-l"],
      "border-color-y": ["border-color-bs", "border-color-be", "border-color-t", "border-color-b"],
      translate: ["translate-x", "translate-y", "translate-none"],
      "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
      "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
      "scroll-mx": ["scroll-ms", "scroll-me", "scroll-mr", "scroll-ml"],
      "scroll-my": ["scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mb"],
      "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
      "scroll-px": ["scroll-ps", "scroll-pe", "scroll-pr", "scroll-pl"],
      "scroll-py": ["scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pb"],
      touch: ["touch-x", "touch-y", "touch-pz"],
      "touch-x": ["touch"],
      "touch-y": ["touch"],
      "touch-pz": ["touch"]
    },
    conflictingClassGroupModifiers: {
      "font-size": ["leading"]
    },
    postfixLookupClassGroups: ["container-type"],
    orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
  };
};
var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

// src/frontend/overlay/ui/cn.ts
function cn(...classes) {
  return twMerge(classes.filter(Boolean).join(" "));
}
// src/frontend/overlay/ui/button.tsx
var BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  command: "bg-foreground text-background hover:bg-foreground/90",
  commandAction: "bg-surface-command-action text-secondary-foreground hover:bg-surface-command-action/82 hover:text-foreground",
  pageAction: "bg-surface-page-action text-muted-foreground hover:bg-surface-page-action/82 hover:text-primary",
  subtle: "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  danger: "bg-destructive/18 text-destructive hover:bg-destructive/28"
};
var BUTTON_SIZES = {
  default: "h-8 px-3 max-md:h-11",
  sm: "h-7 px-2.5 max-md:h-11",
  icon: "size-8 p-0 max-md:size-11",
  workbenchIcon: "h-7.5 w-10 p-0 max-md:size-11",
  commandSm: "size-8.5 rounded-full p-0 max-md:size-11",
  command: "size-9.5 rounded-full p-0 max-md:size-11"
};
var BASE = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs/3 font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4";
function buttonClass(variant = "default", size = "default", className) {
  return cn(BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}
function Button({ variant, size = "default", className, type = "button", ...props }) {
  const resolved = variant ?? (size === "command" || size === "commandSm" ? "command" : "default");
  return /* @__PURE__ */ u3("button", {
    type,
    class: buttonClass(resolved, size, className),
    ...props
  });
}
function IconButton({ label, variant = "ghost", size = "icon", title, ...props }) {
  return /* @__PURE__ */ u3(Button, {
    variant,
    size,
    "aria-label": label,
    title: title ?? label,
    ...props
  });
}
// src/frontend/overlay/ui/switch.tsx
function Switch({ checked, onCheckedChange, disabled, className, ...aria }) {
  const state = checked ? "checked" : "unchecked";
  return /* @__PURE__ */ u3("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "data-state": state,
    disabled,
    onClick: () => onCheckedChange(!checked),
    class: cn("group inline-flex size-11 shrink-0 cursor-pointer items-center justify-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45", className),
    ...aria,
    children: /* @__PURE__ */ u3("span", {
      "aria-hidden": "true",
      class: "pointer-events-none h-5 w-9 rounded-full bg-input p-0.5 ring-1 ring-inset ring-white/10 transition-colors group-data-[state=checked]:bg-primary motion-reduce:transition-none",
      children: /* @__PURE__ */ u3("span", {
        "data-state": state,
        class: "block size-4 translate-x-0 rounded-full bg-muted-foreground shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground motion-reduce:transition-none"
      })
    })
  });
}
// src/frontend/overlay/ui/slider.tsx
function Slider({ value, min = 0, max = 100, step = 1, onValueChange, onValueCommit, disabled, className, ...aria }) {
  const span = max - min;
  const percent = span > 0 ? Math.min(100, Math.max(0, (value - min) / span * 100)) : 0;
  return /* @__PURE__ */ u3("div", {
    "data-slot": "slider",
    "data-disabled": disabled ? "" : undefined,
    class: cn("relative flex h-5 w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-45", className),
    children: [
      /* @__PURE__ */ u3("div", {
        "aria-hidden": "true",
        class: "relative h-1.5 w-full grow overflow-hidden rounded-full bg-input",
        children: /* @__PURE__ */ u3("div", {
          class: "absolute inset-y-0 left-0 bg-primary",
          style: { width: `${percent}%` }
        })
      }),
      /* @__PURE__ */ u3("div", {
        "aria-hidden": "true",
        class: "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-sm ring-2 ring-background",
        style: { left: `${percent}%` }
      }),
      /* @__PURE__ */ u3("input", {
        type: "range",
        min,
        max,
        step,
        value,
        disabled,
        class: "peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed",
        onInput: (event) => onValueChange(Number(event.currentTarget.value)),
        onChange: (event) => onValueCommit?.(Number(event.currentTarget.value)),
        ...aria
      })
    ]
  });
}
// src/frontend/overlay/ui/icons.tsx
function Icon({ className, title, children }) {
  return /* @__PURE__ */ u3("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: cn("size-4 shrink-0", className),
    "aria-hidden": title ? undefined : "true",
    role: title ? "img" : undefined,
    children: [
      title ? /* @__PURE__ */ u3("title", {
        children: title
      }) : null,
      children
    ]
  });
}
var XIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M18 6 6 18"
    }),
    /* @__PURE__ */ u3("path", {
      d: "m6 6 12 12"
    })
  ]
});
var CheckIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: /* @__PURE__ */ u3("path", {
    d: "M20 6 9 17l-5-5"
  })
});
var ChevronDownIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: /* @__PURE__ */ u3("path", {
    d: "m6 9 6 6 6-6"
  })
});
var ArrowLeftIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "m12 19-7-7 7-7"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M19 12H5"
    })
  ]
});
var MenuIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M4 6h16"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M4 12h16"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M4 18h16"
    })
  ]
});
var PanelLeftIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("rect", {
      x: "3",
      y: "3",
      width: "18",
      height: "18",
      rx: "2"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M9 3v18"
    })
  ]
});
var SettingsIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    }),
    /* @__PURE__ */ u3("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    })
  ]
});
var DiamondIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M12 2.5 21.5 12 12 21.5 2.5 12z"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M12 7.5 16.5 12 12 16.5 7.5 12z"
    })
  ]
});
var UsersIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
    }),
    /* @__PURE__ */ u3("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M22 21v-2a4 4 0 0 0-3-3.87"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M16 3.13a4 4 0 0 1 0 7.75"
    })
  ]
});
var TrashIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: [
    /* @__PURE__ */ u3("path", {
      d: "M3 6h18"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
    }),
    /* @__PURE__ */ u3("path", {
      d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
    })
  ]
});
var StopIcon = (p) => /* @__PURE__ */ u3(Icon, {
  ...p,
  children: /* @__PURE__ */ u3("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "1.5"
  })
});

// src/frontend/overlay/ui/layers.tsx
class LayerStack {
  layers = [];
  nextId = 1;
  push(close) {
    const id = this.nextId++;
    this.layers.push({ id, close });
    return () => {
      const index = this.layers.findIndex((layer) => layer.id === id);
      if (index >= 0)
        this.layers.splice(index, 1);
    };
  }
  get size() {
    return this.layers.length;
  }
  closeTop() {
    const top = this.layers.pop();
    if (!top)
      return false;
    top.close();
    return true;
  }
}
var fallbackEnvironment = { layers: new LayerStack, portal: () => null };
var OverlayEnvironmentContext = R(fallbackEnvironment);
function useOverlayEnvironment() {
  return w2(OverlayEnvironmentContext);
}
function useLayer(active, onClose) {
  const { layers } = useOverlayEnvironment();
  const closeRef = T2(onClose);
  closeRef.current = onClose;
  A2(() => {
    if (!active)
      return;
    return layers.push(() => closeRef.current());
  }, [active, layers]);
}
function Portal({ children }) {
  const target = useOverlayEnvironment().portal();
  return target ? W(children, target) : /* @__PURE__ */ u3(x, {
    children
  });
}
var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((element) => !element.hasAttribute("inert") && element.getAttribute("aria-hidden") !== "true");
}
function useFocusTrap(container, active, initialFocus) {
  A2(() => {
    if (!active)
      return;
    const element = container.current;
    if (!element)
      return;
    const previous = element.ownerDocument.activeElement;
    const first = initialFocus?.current || focusableElements(element)[0] || element;
    first.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key !== "Tab")
        return;
      const items = focusableElements(element);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = element.ownerDocument.activeElement;
      if (event.shiftKey && (current === firstItem || !element.contains(current))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (current === lastItem || !element.contains(current))) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function" && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [active]);
}

// src/frontend/overlay/ui/popover.tsx
function placeBelow(anchor, content, viewport, options = {}) {
  const offset = options.offset ?? 6;
  const margin = 8;
  const width = options.matchWidth ? Math.max(anchor.width, content.width) : content.width;
  const spaceBelow = viewport.height - anchor.bottom - offset - margin;
  const spaceAbove = anchor.top - offset - margin;
  const openAbove = content.height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(80, openAbove ? spaceAbove : spaceBelow);
  const height = Math.min(content.height, maxHeight);
  const top = openAbove ? anchor.top - offset - height : anchor.bottom + offset;
  let left = options.align === "end" ? anchor.left + anchor.width - width : options.align === "center" ? anchor.left + anchor.width / 2 - width / 2 : anchor.left;
  left = Math.min(Math.max(margin, left), Math.max(margin, viewport.width - width - margin));
  return { top: Math.max(margin, top), left, maxHeight, ...options.matchWidth ? { width } : {} };
}
function Floating({ open, anchor, onClose, align = "start", matchWidth, className, children, initialFocus, restoreFocus = true, ...rest }) {
  const panel = T2(null);
  const [placement, setPlacement] = d2(null);
  useLayer(open, () => {
    onClose();
    if (restoreFocus)
      anchor.current?.focus();
  });
  F2(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const anchorElement = anchor.current;
      const element = panel.current;
      if (!anchorElement || !element)
        return;
      const view = anchorElement.ownerDocument.defaultView || window;
      const rect = anchorElement.getBoundingClientRect();
      setPlacement(placeBelow(rect, { width: element.offsetWidth, height: element.scrollHeight }, { width: view.innerWidth, height: view.innerHeight }, { align, matchWidth }));
    };
    update();
    const view = anchor.current?.ownerDocument.defaultView || window;
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update, true);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update, true);
    };
  }, [open, align, matchWidth]);
  A2(() => {
    if (!open)
      return;
    (initialFocus?.current || panel.current)?.focus({ preventScroll: true });
    const doc = anchor.current?.ownerDocument || document;
    const onPointerDown = (event) => {
      const target = event.target;
      if (target && (panel.current?.contains(target) || anchor.current?.contains(target)))
        return;
      onClose();
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
    return () => doc.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);
  if (!open)
    return null;
  return /* @__PURE__ */ u3(Portal, {
    children: /* @__PURE__ */ u3("div", {
      ref: panel,
      tabIndex: -1,
      class: cn("fixed z-120 overflow-auto rounded-lg bg-popover text-popover-foreground shadow-2xl outline-none backdrop-blur-2xl", className),
      style: placement ? { top: `${placement.top}px`, left: `${placement.left}px`, maxHeight: `${placement.maxHeight}px`, ...placement.width ? { minWidth: `${placement.width}px` } : {} } : { top: "0px", left: "0px", visibility: "hidden" },
      ...rest,
      children
    })
  });
}

// src/frontend/overlay/ui/select.tsx
function nextEnabled(options, from, direction) {
  if (options.length === 0)
    return -1;
  for (let step = 1;step <= options.length; step += 1) {
    const index = (from + direction * step + options.length * 2) % options.length;
    if (!options[index].disabled)
      return index;
  }
  return -1;
}
function Select({ value, options, onValueChange, placeholder = "Select…", disabled, id, className, ...aria }) {
  const [open, setOpen] = d2(false);
  const [active, setActive] = d2(-1);
  const trigger = T2(null);
  const list = T2(null);
  const listId = P();
  const typeahead = T2({ text: "", at: 0 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const openList = () => {
    if (disabled)
      return;
    setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    setOpen(true);
  };
  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger)
      trigger.current?.focus();
  };
  const choose = (index) => {
    const option = options[index];
    if (!option || option.disabled)
      return;
    onValueChange(option.value);
    close();
  };
  const onListKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => nextEnabled(options, current, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => nextEnabled(options, current, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(nextEnabled(options, -1, 1));
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(nextEnabled(options, 0, -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase(), at: now };
      const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typeahead.current.text));
      if (match >= 0)
        setActive(match);
    }
  };
  const activeId = active >= 0 ? `${listId}-option-${active}` : undefined;
  return /* @__PURE__ */ u3(x, {
    children: [
      /* @__PURE__ */ u3("button", {
        ref: trigger,
        type: "button",
        id,
        role: "combobox",
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-controls": listId,
        disabled,
        "data-state": open ? "open" : "closed",
        "data-placeholder": selected ? undefined : "",
        onClick: () => open ? close() : openList(),
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
          }
        },
        class: cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border-0 bg-input px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-45 max-md:h-11 max-md:text-sm [&_svg]:shrink-0", className),
        ...aria,
        children: [
          /* @__PURE__ */ u3("span", {
            class: cn("min-w-0 truncate text-left", !selected && "text-muted-foreground"),
            children: selected?.label ?? placeholder
          }),
          /* @__PURE__ */ u3(ChevronDownIcon, {
            className: "size-3.5 text-muted-foreground"
          })
        ]
      }),
      /* @__PURE__ */ u3(Floating, {
        open,
        anchor: trigger,
        onClose: () => close(),
        matchWidth: true,
        className: "max-h-[22rem] p-1.5",
        initialFocus: list,
        children: /* @__PURE__ */ u3("div", {
          ref: list,
          id: listId,
          role: "listbox",
          tabIndex: -1,
          "aria-activedescendant": activeId,
          "aria-labelledby": aria["aria-labelledby"],
          "aria-label": aria["aria-label"],
          onKeyDown: onListKeyDown,
          class: "outline-none",
          children: options.map((option, index) => /* @__PURE__ */ u3("div", {
            id: `${listId}-option-${index}`,
            role: "option",
            "aria-selected": index === selectedIndex,
            "aria-disabled": option.disabled || undefined,
            "data-highlighted": index === active ? "" : undefined,
            "data-disabled": option.disabled ? "" : undefined,
            title: option.description,
            onPointerMove: () => {
              if (!option.disabled)
                setActive(index);
            },
            onClick: () => choose(index),
            class: "relative flex min-h-8 cursor-default select-none items-center rounded-md py-1.5 pr-8 pl-2.5 text-xs font-semibold wrap-anywhere whitespace-normal outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-white/7 data-[disabled]:opacity-45 max-md:min-h-11 max-md:text-sm",
            children: [
              /* @__PURE__ */ u3("span", {
                children: option.label
              }),
              index === selectedIndex ? /* @__PURE__ */ u3("span", {
                class: "absolute right-2 grid size-4 place-items-center",
                children: /* @__PURE__ */ u3(CheckIcon, {
                  className: "size-3.5 text-primary"
                })
              }) : null
            ]
          }, option.value))
        })
      })
    ]
  });
}
// src/frontend/overlay/ui/tabs.tsx
function Tabs({ items, value, onValueChange, idPrefix, className, tabClassName, ...aria }) {
  const refs = T2([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);
  const move = (from, delta) => {
    if (enabled.length === 0)
      return;
    const position = enabled.findIndex(({ index }) => index === from);
    const next = enabled[(position + delta + enabled.length) % enabled.length];
    onValueChange(next.item.id);
    refs.current[next.index]?.focus();
  };
  return /* @__PURE__ */ u3("div", {
    role: "tablist",
    class: cn("flex min-w-0 items-center gap-1", className),
    ...aria,
    children: items.map((item, index) => {
      const selected = item.id === value;
      return /* @__PURE__ */ u3("button", {
        ref: (element) => {
          refs.current[index] = element;
        },
        type: "button",
        role: "tab",
        id: `${idPrefix}-tab-${item.id}`,
        "aria-selected": selected,
        "aria-controls": `${idPrefix}-panel-${item.id}`,
        "aria-label": item.ariaLabel,
        tabIndex: selected ? 0 : -1,
        disabled: item.disabled,
        "data-state": selected ? "active" : "inactive",
        onClick: () => onValueChange(item.id),
        onKeyDown: (event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(index, 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(index, -1);
          } else if (event.key === "Home") {
            event.preventDefault();
            const first = enabled[0];
            if (first) {
              onValueChange(first.item.id);
              refs.current[first.index]?.focus();
            }
          } else if (event.key === "End") {
            event.preventDefault();
            const last = enabled[enabled.length - 1];
            if (last) {
              onValueChange(last.item.id);
              refs.current[last.index]?.focus();
            }
          }
        },
        class: cn("inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground max-md:h-11", tabClassName),
        children: item.label
      }, item.id);
    })
  });
}
function tabPanelProps(idPrefix, id) {
  return {
    role: "tabpanel",
    id: `${idPrefix}-panel-${id}`,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    tabIndex: 0
  };
}
// src/frontend/overlay/ui/dialog.tsx
function Dialog({ open, onOpenChange, title, description, children, footer, showCloseButton = true, dismissible = true, className, role = "dialog", initialFocus, closeLabel = "Close" }) {
  const panel = T2(null);
  const titleId = P();
  const descriptionId = P();
  useLayer(open, () => onOpenChange(false));
  useFocusTrap(panel, open, initialFocus);
  if (!open)
    return null;
  return /* @__PURE__ */ u3(Portal, {
    children: [
      /* @__PURE__ */ u3("div", {
        class: "fixed inset-0 z-100 bg-black/68 backdrop-blur-sm",
        "aria-hidden": "true",
        onClick: () => {
          if (dismissible)
            onOpenChange(false);
        }
      }),
      /* @__PURE__ */ u3("div", {
        ref: panel,
        role,
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "aria-describedby": description ? descriptionId : undefined,
        tabIndex: -1,
        class: cn("fixed left-1/2 top-1/2 z-110 grid max-h-[calc(100%-32px)] w-[min(480px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg bg-popover p-5 text-popover-foreground shadow-2xl outline-none backdrop-blur-2xl", className),
        children: [
          /* @__PURE__ */ u3("div", {
            class: cn("grid gap-1.5", showCloseButton && "pr-8"),
            children: [
              /* @__PURE__ */ u3("h2", {
                id: titleId,
                class: "text-base font-extrabold",
                children: title
              }),
              description ? /* @__PURE__ */ u3("p", {
                id: descriptionId,
                class: "text-xs leading-relaxed text-muted-foreground",
                children: description
              }) : null
            ]
          }),
          children,
          footer ? /* @__PURE__ */ u3("div", {
            class: "flex justify-end gap-2",
            children: footer
          }) : null,
          showCloseButton ? /* @__PURE__ */ u3("button", {
            type: "button",
            onClick: () => onOpenChange(false),
            class: "absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:size-11",
            children: [
              /* @__PURE__ */ u3(XIcon, {
                className: "size-4"
              }),
              /* @__PURE__ */ u3("span", {
                class: "sr-only",
                children: closeLabel
              })
            ]
          }) : null
        ]
      })
    ]
  });
}
// src/frontend/overlay/ui/toast.tsx
class ToastStore {
  toasts = [];
  listeners = new Set;
  nextId = 1;
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  list() {
    return this.toasts;
  }
  show(input) {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { ...input, tone: input.tone ?? "info", id }].slice(-5);
    this.emit();
    return id;
  }
  update(id, patch) {
    this.toasts = this.toasts.map((toast) => toast.id === id ? { ...toast, ...patch, tone: patch.tone ?? toast.tone } : toast);
    this.emit();
  }
  dismiss(id) {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.emit();
  }
  clear() {
    this.toasts = [];
    this.emit();
  }
  emit() {
    for (const listener of this.listeners)
      listener();
  }
}
var ToastContext = R(new ToastStore);
function useToasts() {
  return w2(ToastContext);
}
var FILL = {
  running: "bg-gradient-to-r from-toast-running-soft via-toast-running-fill to-toast-running-lead",
  info: "bg-gradient-to-r from-toast-running-soft via-toast-running-fill to-toast-running-lead",
  success: "bg-gradient-to-r from-toast-success-soft via-toast-success-fill to-toast-success-lead",
  warning: "bg-gradient-to-r from-toast-warning-soft via-toast-warning-fill to-toast-warning-lead",
  danger: "bg-gradient-to-r from-toast-danger-soft via-toast-danger-fill to-toast-danger-lead"
};
function Toast({ toast, onDismiss, labels }) {
  const duration = toast.tone === "running" ? 0 : toast.durationMs ?? 1e4;
  A2(() => {
    if (duration <= 0)
      return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, toast.id]);
  const danger = toast.tone === "danger";
  const progress = Math.min(1, Math.max(0, toast.progress ?? (toast.tone === "running" ? 0 : 1)));
  const scale = toast.tone === "running" ? Math.max(0.02, progress) : progress;
  return /* @__PURE__ */ u3("div", {
    class: "pointer-events-auto relative flex h-7 w-[70%] max-w-133 min-w-0 items-center overflow-hidden rounded-full bg-toast-surface pl-3 pr-1.5 backdrop-blur-[18px]",
    role: danger ? "alert" : "status",
    "aria-live": danger ? "assertive" : "polite",
    title: toast.message,
    children: [
      /* @__PURE__ */ u3("span", {
        "aria-hidden": "true",
        class: cn("absolute inset-y-0 left-0 w-full origin-left transition-transform duration-150 ease-out", FILL[toast.tone]),
        style: { transform: `scaleX(${scale})` }
      }),
      toast.tone === "running" ? /* @__PURE__ */ u3("span", {
        "aria-hidden": "true",
        class: "relative mr-2 size-3.5 shrink-0 animate-spin rounded-full border-2 border-toast-spinner border-b-transparent motion-reduce:animate-none"
      }) : toast.tone === "success" ? /* @__PURE__ */ u3(CheckIcon, {
        className: "relative mr-2 size-3.5 shrink-0 text-success"
      }) : null,
      /* @__PURE__ */ u3("span", {
        class: cn("relative min-w-0 flex-1 truncate text-xs/3 font-semibold", danger ? "text-destructive" : toast.tone === "success" ? "text-success" : toast.tone === "warning" ? "text-warning" : "text-foreground"),
        children: toast.message
      }),
      toast.onCancel ? /* @__PURE__ */ u3("button", {
        type: "button",
        onClick: toast.onCancel,
        "aria-label": labels.stopTask,
        title: labels.stopTask,
        class: "relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55",
        children: /* @__PURE__ */ u3(StopIcon, {
          className: "size-3.5"
        })
      }) : null,
      /* @__PURE__ */ u3("button", {
        type: "button",
        onClick: onDismiss,
        "aria-label": labels.closeNotification,
        title: labels.closeNotification,
        class: "relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55",
        children: /* @__PURE__ */ u3(XIcon, {
          className: "size-3.5"
        })
      })
    ]
  });
}
function ToastHost({ labels, className }) {
  const store = useToasts();
  const [, setVersion] = d2(0);
  A2(() => store.subscribe(() => setVersion((value) => value + 1)), [store]);
  const toasts = store.list();
  return /* @__PURE__ */ u3("div", {
    class: cn("pointer-events-none fixed inset-x-0 bottom-4 z-140 flex flex-col items-center gap-2", className),
    "data-ii-am-toasts": "",
    children: toasts.map((toast) => /* @__PURE__ */ u3(Toast, {
      toast,
      labels,
      onDismiss: () => store.dismiss(toast.id)
    }, toast.id))
  });
}
function ToastProvider({ store, children }) {
  return /* @__PURE__ */ u3(ToastContext.Provider, {
    value: store,
    children
  });
}
// src/frontend/overlay/ui/confirm.tsx
var ConfirmContext = R(async () => false);
function ConfirmProvider({ children, defaultCancelLabel = "Cancel" }) {
  const [request, setRequest] = d2(null);
  const resolver = T2(null);
  const confirmButton = T2(null);
  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };
  const confirm = j2((options) => {
    resolver.current?.(false);
    setRequest(options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const danger = (request?.tone ?? "danger") === "danger";
  return /* @__PURE__ */ u3(ConfirmContext.Provider, {
    value: confirm,
    children: [
      children,
      /* @__PURE__ */ u3(Dialog, {
        open: request !== null,
        onOpenChange: (open) => {
          if (!open)
            settle(false);
        },
        role: "alertdialog",
        title: request?.title ?? "",
        description: request?.description,
        showCloseButton: false,
        className: "w-[min(420px,calc(100%-32px))] gap-4",
        initialFocus: confirmButton,
        footer: /* @__PURE__ */ u3(x, {
          children: [
            /* @__PURE__ */ u3(Button, {
              variant: "ghost",
              onClick: () => settle(false),
              children: request?.cancelLabel ?? defaultCancelLabel
            }),
            /* @__PURE__ */ u3(Button, {
              ref: confirmButton,
              variant: danger ? "danger" : "default",
              onClick: () => settle(true),
              children: [
                danger ? /* @__PURE__ */ u3(TrashIcon, {}) : null,
                request?.confirmLabel
              ]
            })
          ]
        })
      })
    ]
  });
}
// src/frontend/overlay/settings.tsx
function sectionLabel(section) {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find((entry) => entry.id === section);
    if (item)
      return item.label;
  }
  return section;
}
function SettingsPage(props) {
  return /* @__PURE__ */ u3("div", {
    class: "grid content-start gap-6 px-5 py-5",
    "data-settings-page": props.section,
    children: [
      /* @__PURE__ */ u3("header", {
        class: "mx-auto flex min-h-8 w-full max-w-190 items-center justify-between gap-3",
        "data-settings-page-header": "",
        children: /* @__PURE__ */ u3("h1", {
          class: "truncate text-lg leading-tight font-extrabold",
          children: sectionLabel(props.section)
        })
      }),
      /* @__PURE__ */ u3("div", {
        class: "mx-auto grid w-full max-w-190 content-start gap-2",
        children: props.section === "system" ? /* @__PURE__ */ u3(SystemSettings, {
          ...props
        }) : /* @__PURE__ */ u3(Placeholder, {})
      })
    ]
  });
}
function SettingsSectionCard({ title, children, disabled }) {
  return /* @__PURE__ */ u3("section", {
    class: cn("grid gap-2.5 pt-2.5 pb-4.5 transition-opacity", disabled && "opacity-45"),
    "aria-disabled": disabled || undefined,
    inert: disabled || undefined,
    children: [
      /* @__PURE__ */ u3("h2", {
        class: "flex h-9.5 items-center px-0.5 text-xs font-extrabold",
        children: title
      }),
      /* @__PURE__ */ u3("div", {
        class: "divide-y divide-white/5 overflow-hidden rounded-lg bg-card px-4",
        children
      })
    ]
  });
}
function SettingsRow({ title, description, children, labelId, className }) {
  return /* @__PURE__ */ u3("div", {
    class: cn("grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3", className),
    children: [
      /* @__PURE__ */ u3("div", {
        class: "min-w-0 pr-4",
        children: [
          /* @__PURE__ */ u3("strong", {
            id: labelId,
            class: "block text-xs font-bold",
            children: title
          }),
          description ? /* @__PURE__ */ u3("span", {
            class: "mt-0.5 block max-w-140 text-xs leading-relaxed text-muted-foreground",
            children: description
          }) : null
        ]
      }),
      /* @__PURE__ */ u3("div", {
        class: "flex min-w-0 items-center justify-end gap-2",
        children
      })
    ]
  });
}
function SystemSettings({ config, patchConfig, developerMode, onDeveloperModeChange }) {
  const toasts = useToasts();
  const clicks = T2({ count: 0, at: 0 });
  const onHiddenRowClick = () => {
    const now = Date.now();
    clicks.current = { count: now - clicks.current.at < 1500 ? clicks.current.count + 1 : 1, at: now };
    if (clicks.current.count < 5)
      return;
    clicks.current = { count: 0, at: 0 };
    onDeveloperModeChange(!developerMode);
    toasts.show({ message: developerMode ? SYSTEM_SETTINGS_LABELS.developerModeDisabled : SYSTEM_SETTINGS_LABELS.developerModeEnabled, tone: "success", durationMs: 3000 });
  };
  return /* @__PURE__ */ u3(x, {
    children: [
      /* @__PURE__ */ u3(SettingsSectionCard, {
        title: SYSTEM_SETTINGS_LABELS.displaySection,
        children: [
          /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.fabCorner,
            description: SYSTEM_SETTINGS_LABELS.fabCornerDescription,
            labelId: "ii-am-fab-corner",
            children: /* @__PURE__ */ u3("div", {
              class: "w-44",
              children: /* @__PURE__ */ u3(Select, {
                "aria-labelledby": "ii-am-fab-corner",
                value: config.fabCorner,
                options: FAB_CORNER_OPTIONS,
                onValueChange: (value) => patchConfig({ fabCorner: value })
              })
            })
          }),
          /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.imageAspect,
            description: SYSTEM_SETTINGS_LABELS.imageAspectDescription,
            labelId: "ii-am-image-aspect",
            children: /* @__PURE__ */ u3("div", {
              class: "w-44",
              children: /* @__PURE__ */ u3(Select, {
                "aria-labelledby": "ii-am-image-aspect",
                value: config.inlayImageAspect,
                options: INLAY_IMAGE_ASPECT_PRESETS,
                onValueChange: (value) => patchConfig({ inlayImageAspect: value })
              })
            })
          }),
          /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.imageHeight,
            description: SYSTEM_SETTINGS_LABELS.imageHeightDescription,
            labelId: "ii-am-image-height",
            children: /* @__PURE__ */ u3("div", {
              class: "flex h-8 w-56 items-center gap-3",
              children: /* @__PURE__ */ u3(HeightSlider, {
                value: config.inlayImageMaxHeightVh,
                onCommit: (value) => patchConfig({ inlayImageMaxHeightVh: value })
              })
            })
          }),
          /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.alignment,
            description: SYSTEM_SETTINGS_LABELS.alignmentDescription,
            children: /* @__PURE__ */ u3(Switch, {
              "aria-label": SYSTEM_SETTINGS_LABELS.alignment,
              checked: config.imageAlignment === "left",
              onCheckedChange: (checked) => patchConfig({ imageAlignment: checked ? "left" : "center" })
            })
          })
        ]
      }),
      /* @__PURE__ */ u3(SettingsSectionCard, {
        title: SYSTEM_SETTINGS_LABELS.diagnosticsSection,
        children: [
          /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.debugLogging,
            description: SYSTEM_SETTINGS_LABELS.debugLoggingDescription,
            children: /* @__PURE__ */ u3(Switch, {
              "aria-label": SYSTEM_SETTINGS_LABELS.debugLogging,
              checked: config.debugLogging,
              onCheckedChange: (checked) => patchConfig({ debugLogging: checked })
            })
          }),
          developerMode ? /* @__PURE__ */ u3(SettingsRow, {
            title: SYSTEM_SETTINGS_LABELS.developerMode,
            description: SYSTEM_SETTINGS_LABELS.developerModeOn
          }) : null
        ]
      }),
      /* @__PURE__ */ u3("div", {
        "aria-hidden": "true",
        class: "h-8 w-full",
        "data-developer-mode-trigger": "",
        onClick: onHiddenRowClick
      })
    ]
  });
}
function HeightSlider({ value, onCommit }) {
  const [draft, setDraft] = d2(value);
  A2(() => setDraft(value), [value]);
  return /* @__PURE__ */ u3(x, {
    children: [
      /* @__PURE__ */ u3(Slider, {
        "aria-labelledby": "ii-am-image-height",
        value: draft,
        min: 10,
        max: 100,
        step: 5,
        onValueChange: setDraft,
        onValueCommit: (next) => {
          if (next !== value)
            onCommit(next);
        }
      }),
      /* @__PURE__ */ u3("span", {
        class: "w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground",
        children: [
          draft,
          "vh"
        ]
      })
    ]
  });
}

// src/frontend/overlay/store.ts
class FrontendStore {
  snapshot;
  listeners = new Set;
  constructor(initial) {
    this.snapshot = {
      chatId: "",
      status: "Loading…",
      config: { ...DEFAULT_CONFIG },
      parserConnections: [],
      imageConnections: [],
      overlayOpen: false,
      ...initial
    };
  }
  get() {
    return this.snapshot;
  }
  set(patch) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners)
      listener();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
function useStore(store) {
  const [snapshot, setSnapshot] = d2(() => store.get());
  A2(() => {
    setSnapshot(store.get());
    return store.subscribe(() => setSnapshot(store.get()));
  }, [store]);
  return snapshot;
}

// src/frontend/overlay/viewport.ts
function isMobileViewport(win = typeof window === "undefined" ? undefined : window) {
  try {
    return Boolean(win?.matchMedia?.(MOBILE_MEDIA_QUERY).matches);
  } catch {
    return false;
  }
}
function useIsMobile() {
  const [mobile, setMobile] = d2(() => isMobileViewport());
  A2(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return mobile;
}
function keyboardInset(win) {
  const viewport = win.visualViewport;
  if (!viewport)
    return 0;
  return Math.max(0, Math.round(win.innerHeight - viewport.height - viewport.offsetTop));
}
function trackKeyboardInset(element, win) {
  const update = () => element.style.setProperty("--ii-am-keyboard-inset", `${keyboardInset(win)}px`);
  update();
  const viewport = win.visualViewport;
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  };
}

// src/frontend/overlay/App.tsx
var TAB_ID_PREFIX = "ii-am-workspace";
var SIDEBAR_WIDTH = 292;
function OverlayApp({ layers, toasts, portal, ...props }) {
  return /* @__PURE__ */ u3(OverlayEnvironmentContext.Provider, {
    value: { layers, portal },
    children: /* @__PURE__ */ u3(ToastProvider, {
      store: toasts,
      children: /* @__PURE__ */ u3(ConfirmProvider, {
        defaultCancelLabel: SHELL_LABELS.cancel,
        children: [
          /* @__PURE__ */ u3(Shell, {
            ...props
          }),
          /* @__PURE__ */ u3(ToastHost, {
            labels: { stopTask: SHELL_LABELS.stopTask, closeNotification: SHELL_LABELS.closeNotification }
          })
        ]
      })
    })
  });
}
function Shell({ store, navigation, onClose, patchConfig }) {
  const snapshot = useStore(store);
  const mobile = useIsMobile();
  const [activeTab, setActiveTab] = d2(navigation.tab ?? "assets");
  const [settingsOpen, setSettingsOpen] = d2(Boolean(navigation.settings));
  const [section, setSection] = d2(navigation.settings ?? DEFAULT_SETTINGS_SECTION);
  const [sidebarOpen, setSidebarOpen] = d2(true);
  const [drawerOpen, setDrawerOpen] = d2(false);
  const [developerMode, setDeveloperMode] = d2(false);
  A2(() => {
    if (!navigation.requestId)
      return;
    if (navigation.settings) {
      setSection(navigation.settings);
      setSettingsOpen(true);
    } else if (navigation.tab) {
      setActiveTab(navigation.tab);
      setSettingsOpen(false);
    }
  }, [navigation.requestId]);
  A2(() => {
    if (!developerMode && section === "logs")
      setSection(DEFAULT_SETTINGS_SECTION);
  }, [developerMode, section]);
  const toggleSettings = () => {
    setSettingsOpen((open) => !open);
    setDrawerOpen(false);
  };
  const selectSection = (id) => {
    setSection(id);
    setDrawerOpen(false);
  };
  const selectTab = (id) => {
    setActiveTab(id);
    setSettingsOpen(false);
  };
  const sidebarLabel = settingsOpen ? SHELL_LABELS.settingsList : SHELL_LABELS.rosterList;
  const sidebar = settingsOpen ? /* @__PURE__ */ u3(SettingsNavigation, {
    active: section,
    developerMode,
    onSelect: selectSection,
    onBack: toggleSettings
  }) : /* @__PURE__ */ u3(RosterPlaceholder, {});
  const main = settingsOpen ? /* @__PURE__ */ u3(SettingsPage, {
    section,
    config: snapshot.config,
    patchConfig,
    developerMode,
    onDeveloperModeChange: setDeveloperMode
  }) : /* @__PURE__ */ u3(WorkspacePlaceholder, {
    tab: activeTab
  });
  if (mobile) {
    return /* @__PURE__ */ u3("div", {
      class: "flex h-full min-h-0 w-full flex-col bg-workspace-pane text-foreground",
      "data-ii-am-shell": "mobile",
      children: [
        /* @__PURE__ */ u3("header", {
          class: "flex h-14 shrink-0 items-center gap-1 border-b border-border px-2",
          children: [
            /* @__PURE__ */ u3(IconButton, {
              label: SHELL_LABELS.sidebarToggle(sidebarLabel),
              "aria-expanded": drawerOpen,
              onClick: () => setDrawerOpen(!drawerOpen),
              children: /* @__PURE__ */ u3(MenuIcon, {})
            }),
            /* @__PURE__ */ u3("div", {
              class: "min-w-0 flex-1 truncate px-1 text-sm font-extrabold",
              children: SHELL_LABELS.appName
            }),
            !settingsOpen ? /* @__PURE__ */ u3(IconButton, {
              label: SHELL_LABELS.openSettings,
              title: "Settings",
              onClick: toggleSettings,
              "data-mobile-settings-entry": "",
              children: /* @__PURE__ */ u3(SettingsIcon, {})
            }) : null,
            /* @__PURE__ */ u3(IconButton, {
              label: SHELL_LABELS.close,
              onClick: onClose,
              children: /* @__PURE__ */ u3(XIcon, {})
            })
          ]
        }),
        !settingsOpen ? /* @__PURE__ */ u3(Tabs, {
          idPrefix: TAB_ID_PREFIX,
          "aria-label": SHELL_LABELS.workspaceNav,
          className: "shrink-0 overflow-x-auto border-b border-border px-2 py-1",
          items: WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.mobileLabel, ariaLabel: tab.label })),
          value: activeTab,
          onValueChange: selectTab
        }) : null,
        /* @__PURE__ */ u3("main", {
          class: "min-h-0 flex-1 overflow-y-auto",
          children: main
        }),
        /* @__PURE__ */ u3(MobileDrawer, {
          open: drawerOpen,
          label: sidebarLabel,
          onClose: () => setDrawerOpen(false),
          children: sidebar
        })
      ]
    });
  }
  const showSidebar = settingsOpen || sidebarOpen;
  return /* @__PURE__ */ u3("div", {
    class: "grid h-full min-h-0 w-full bg-workspace-pane text-foreground",
    style: { gridTemplateColumns: `60px ${showSidebar ? SIDEBAR_WIDTH : 0}px minmax(0,1fr)` },
    "data-ii-am-shell": "desktop",
    children: [
      /* @__PURE__ */ u3(Rail, {
        settingsOpen,
        onToggleSettings: toggleSettings
      }),
      /* @__PURE__ */ u3("aside", {
        "aria-label": sidebarLabel,
        inert: !showSidebar,
        class: cn("min-h-0 min-w-0 overflow-hidden border-r border-border bg-sidebar transition-opacity", !showSidebar && "opacity-0"),
        children: sidebar
      }),
      /* @__PURE__ */ u3("section", {
        class: "flex min-h-0 min-w-0 flex-col",
        "data-workspace-pane": "primary",
        children: [
          /* @__PURE__ */ u3("header", {
            class: "flex h-12 shrink-0 items-center gap-2 border-b border-border px-3",
            children: [
              !settingsOpen ? /* @__PURE__ */ u3(IconButton, {
                label: SHELL_LABELS.sidebarToggle(sidebarLabel),
                "aria-pressed": sidebarOpen,
                onClick: () => setSidebarOpen(!sidebarOpen),
                children: /* @__PURE__ */ u3(PanelLeftIcon, {})
              }) : null,
              !settingsOpen ? /* @__PURE__ */ u3(Tabs, {
                idPrefix: TAB_ID_PREFIX,
                "aria-label": SHELL_LABELS.workspaceNav,
                className: "min-w-0 flex-1 overflow-x-auto",
                items: WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.label })),
                value: activeTab,
                onValueChange: selectTab
              }) : /* @__PURE__ */ u3("div", {
                class: "min-w-0 flex-1"
              }),
              /* @__PURE__ */ u3(IconButton, {
                label: SHELL_LABELS.close,
                onClick: onClose,
                children: /* @__PURE__ */ u3(XIcon, {})
              })
            ]
          }),
          /* @__PURE__ */ u3("div", {
            class: "min-h-0 flex-1 overflow-y-auto",
            "data-workspace-scroll": "",
            children: main
          })
        ]
      })
    ]
  });
}
function Rail({ settingsOpen, onToggleSettings }) {
  return /* @__PURE__ */ u3("nav", {
    "aria-label": SHELL_LABELS.characterSelection,
    class: "flex min-h-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3",
    children: [
      /* @__PURE__ */ u3("div", {
        class: "grid size-10 place-items-center rounded-lg bg-surface-navigation-selected text-primary",
        title: SHELL_LABELS.appName,
        "aria-hidden": "true",
        children: /* @__PURE__ */ u3(DiamondIcon, {
          className: "size-5"
        })
      }),
      /* @__PURE__ */ u3("div", {
        class: "min-h-0 w-full flex-1"
      }),
      /* @__PURE__ */ u3(IconButton, {
        label: SHELL_LABELS.settings,
        "aria-pressed": settingsOpen,
        "data-charx-settings": "",
        onClick: onToggleSettings,
        className: cn("mt-2 size-8 shrink-0", settingsOpen && "bg-surface-navigation-selected text-selected-foreground"),
        children: /* @__PURE__ */ u3(SettingsIcon, {})
      })
    ]
  });
}
function SettingsNavigation({ active, developerMode, onSelect, onBack }) {
  return /* @__PURE__ */ u3("div", {
    class: "flex h-full min-h-0 flex-col",
    children: [
      /* @__PURE__ */ u3("div", {
        class: "shrink-0 p-2.5",
        children: /* @__PURE__ */ u3(Button, {
          variant: "ghost",
          className: "w-full justify-start",
          onClick: onBack,
          "aria-label": SHELL_LABELS.backToWorkspace,
          title: SHELL_LABELS.backToWorkspace,
          children: [
            /* @__PURE__ */ u3(ArrowLeftIcon, {}),
            SHELL_LABELS.backToWorkspace
          ]
        })
      }),
      /* @__PURE__ */ u3("nav", {
        class: "min-h-0 flex-1 overflow-y-auto px-2.5 pb-4",
        "aria-label": SHELL_LABELS.settings,
        children: SETTINGS_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.developerOnly || developerMode);
          if (items.length === 0)
            return null;
          return /* @__PURE__ */ u3("section", {
            class: "grid gap-1 pb-4",
            children: [
              /* @__PURE__ */ u3("h2", {
                class: "flex h-7.5 items-center px-2 text-3xs font-black uppercase text-muted-foreground",
                children: group.label
              }),
              /* @__PURE__ */ u3("div", {
                class: "grid gap-0.5",
                children: items.map((item) => {
                  const current = item.id === active;
                  return /* @__PURE__ */ u3("button", {
                    type: "button",
                    "data-settings-navigation-item": item.id,
                    "aria-current": current ? "page" : undefined,
                    onClick: () => onSelect(item.id),
                    class: cn("flex h-9 w-full items-center rounded-md px-2.5 text-left text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-surface-navigation-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55", current && "bg-surface-navigation-selected text-selected-foreground hover:bg-surface-navigation-selected"),
                    children: item.label
                  }, item.id);
                })
              })
            ]
          }, group.label);
        })
      })
    ]
  });
}
function RosterPlaceholder() {
  return /* @__PURE__ */ u3("div", {
    class: "flex h-full min-h-0 flex-col",
    children: [
      /* @__PURE__ */ u3("header", {
        class: "flex h-12 shrink-0 items-center gap-2 px-3",
        children: [
          /* @__PURE__ */ u3(UsersIcon, {
            className: "text-muted-foreground"
          }),
          /* @__PURE__ */ u3("h2", {
            class: "text-xs font-extrabold",
            children: SHELL_LABELS.rosterTitle
          })
        ]
      }),
      /* @__PURE__ */ u3("div", {
        class: "m-3 rounded-lg bg-card p-4 text-xs leading-relaxed text-muted-foreground",
        children: SHELL_LABELS.rosterPlaceholder
      })
    ]
  });
}
function WorkspacePlaceholder({ tab }) {
  const definition = WORKSPACE_TABS.find((entry) => entry.id === tab);
  return /* @__PURE__ */ u3("div", {
    ...tabPanelProps(TAB_ID_PREFIX, tab),
    class: "mx-auto grid w-full max-w-190 content-start gap-4 p-5 outline-none",
    children: [
      /* @__PURE__ */ u3("h1", {
        class: "text-lg leading-tight font-extrabold",
        children: definition.label
      }),
      /* @__PURE__ */ u3(Placeholder, {
        children: definition.description
      })
    ]
  });
}
function MobileDrawer({ open, label, onClose, children }) {
  const panel = T2(null);
  useLayer(open, onClose);
  useFocusTrap(panel, open);
  if (!open)
    return null;
  return /* @__PURE__ */ u3("div", {
    class: "fixed inset-0 z-90",
    children: [
      /* @__PURE__ */ u3("button", {
        type: "button",
        tabIndex: -1,
        "aria-label": SHELL_LABELS.sidebarClose(label),
        class: "absolute inset-0 bg-black/50",
        onClick: onClose
      }),
      /* @__PURE__ */ u3("div", {
        ref: panel,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": label,
        class: "absolute inset-y-0 left-0 flex w-[min(320px,86%)] flex-col bg-sidebar shadow-2xl animate-mobile-workspace-in",
        children
      })
    ]
  });
}

// src/frontend/overlay/controller.tsx
function createOverlayController(ctx, options) {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const layers = new LayerStack;
  const toasts = new ToastStore;
  let host = null;
  let root = null;
  let appMount = null;
  let layer = null;
  let stopKeyboardTracking = null;
  let open = false;
  let navigation = { requestId: 0 };
  let restoreFocus = null;
  const onKeyDown = (event) => {
    handleOverlayEscape(event, { open, root, layers, closeOverlay: () => controller.close() });
  };
  function renderApp() {
    if (!appMount)
      return;
    K(/* @__PURE__ */ u3(OverlayApp, {
      store: options.store,
      layers,
      toasts,
      portal: () => layer,
      navigation,
      onClose: () => controller.close(),
      patchConfig: options.patchConfig
    }), appMount);
  }
  function ensureMounted() {
    if (host)
      return;
    host = createOverlayHost(ctx.ui, doc, options.onHostFallback);
    root = doc.createElement("div");
    root.className = `${OVERLAY_ROOT_CLASS} ${OVERLAY_FRAME_CLASS}`;
    root.setAttribute("data-state", "closed");
    root.setAttribute("data-ii-am-host-kind", host.kind);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Inlay Illustrator");
    root.tabIndex = -1;
    appMount = doc.createElement("div");
    appMount.className = "ii-am-app";
    appMount.style.cssText = "display:flex;flex:1 1 auto;min-height:0;min-width:0;flex-direction:column;";
    layer = doc.createElement("div");
    layer.setAttribute("data-ii-am-layer", "");
    root.append(appMount, layer);
    host.container.appendChild(root);
    stopKeyboardTracking = trackKeyboardInset(root, win);
    renderApp();
  }
  const controller = {
    open(openOptions) {
      if (openOptions?.tab || openOptions?.settings) {
        navigation = {
          requestId: navigation.requestId + 1,
          tab: openOptions.tab,
          settings: openOptions.settings === true ? "charx" : openOptions.settings
        };
        if (host)
          renderApp();
      }
      ensureMounted();
      if (open)
        return;
      open = true;
      restoreFocus = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;
      root.setAttribute("data-state", "open");
      host.setVisible(true);
      win.addEventListener("keydown", onKeyDown, true);
      options.store.set({ overlayOpen: true });
      root.focus({ preventScroll: true });
    },
    close() {
      if (!open)
        return;
      open = false;
      win.removeEventListener("keydown", onKeyDown, true);
      root?.setAttribute("data-state", "closed");
      host?.setVisible(false);
      options.store.set({ overlayOpen: false });
      if (restoreFocus?.isConnected)
        restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    },
    toggle() {
      if (open)
        controller.close();
      else
        controller.open();
    },
    isOpen: () => open,
    hostKind: () => host?.kind ?? null,
    toasts,
    destroy() {
      controller.close();
      stopKeyboardTracking?.();
      if (appMount)
        K(null, appMount);
      root?.remove();
      host?.destroy();
      host = null;
      root = null;
      appMount = null;
      layer = null;
    }
  };
  return controller;
}

// src/frontend/overlay/launcher.tsx
function LauncherPanel({ store, onOpen }) {
  const snapshot = useStore(store);
  return /* @__PURE__ */ u3("div", {
    class: "grid gap-3 p-3 text-foreground",
    children: [
      /* @__PURE__ */ u3("div", {
        class: "grid gap-1",
        children: [
          /* @__PURE__ */ u3("h2", {
            class: "text-sm font-extrabold",
            children: LAUNCHER_LABELS.title
          }),
          /* @__PURE__ */ u3("p", {
            class: "text-xs leading-relaxed text-muted-foreground",
            children: LAUNCHER_LABELS.subtitle
          })
        ]
      }),
      /* @__PURE__ */ u3(Button, {
        className: "w-full",
        onClick: onOpen,
        "aria-pressed": snapshot.overlayOpen,
        children: LAUNCHER_LABELS.open
      }),
      /* @__PURE__ */ u3("div", {
        class: "grid gap-0.5 rounded-md bg-card px-3 py-2",
        role: "status",
        "aria-live": "polite",
        children: [
          /* @__PURE__ */ u3("span", {
            class: "text-3xs font-black uppercase text-muted-foreground",
            children: LAUNCHER_LABELS.status
          }),
          /* @__PURE__ */ u3("span", {
            class: "text-xs wrap-anywhere",
            children: snapshot.status
          })
        ]
      })
    ]
  });
}

// src/frontend/overlay/styles/overlay.generated.css
var overlay_generated_default = `/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */
@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){.ii-am-root *,.ii-am-root :before,.ii-am-root :after,.ii-am-root ::backdrop{--tw-translate-x:0;--tw-translate-y:0;--tw-translate-z:0;--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-divide-y-reverse:0;--tw-border-style:solid;--tw-gradient-position:initial;--tw-gradient-from:#0000;--tw-gradient-via:#0000;--tw-gradient-to:#0000;--tw-gradient-stops:initial;--tw-gradient-via-stops:initial;--tw-gradient-from-position:0%;--tw-gradient-via-position:50%;--tw-gradient-to-position:100%;--tw-leading:initial;--tw-font-weight:initial;--tw-ordinal:initial;--tw-slashed-zero:initial;--tw-numeric-figure:initial;--tw-numeric-spacing:initial;--tw-numeric-fraction:initial;--tw-shadow:0 0 #0000;--tw-shadow-color:initial;--tw-shadow-alpha:100%;--tw-inset-shadow:0 0 #0000;--tw-inset-shadow-color:initial;--tw-inset-shadow-alpha:100%;--tw-ring-color:initial;--tw-ring-shadow:0 0 #0000;--tw-inset-ring-color:initial;--tw-inset-ring-shadow:0 0 #0000;--tw-ring-inset:initial;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-offset-shadow:0 0 #0000;--tw-outline-style:solid;--tw-backdrop-blur:initial;--tw-backdrop-brightness:initial;--tw-backdrop-contrast:initial;--tw-backdrop-grayscale:initial;--tw-backdrop-hue-rotate:initial;--tw-backdrop-invert:initial;--tw-backdrop-opacity:initial;--tw-backdrop-saturate:initial;--tw-backdrop-sepia:initial;--tw-duration:initial;--tw-ease:initial}}.ii-am-root{--font-sans:var(--lumiverse-font-family,Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);--font-mono:var(--lumiverse-font-mono,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);--color-black:#000;--color-white:#fff;--spacing:.25rem;--text-xs:calc(.75rem * var(--lumiverse-font-scale,1));--text-xs--line-height:calc(1 / .75);--text-sm:calc(.875rem * var(--lumiverse-font-scale,1));--text-sm--line-height:calc(1.25 / .875);--text-base:calc(1rem * var(--lumiverse-font-scale,1));--text-base--line-height:calc(1.5 / 1);--text-lg:calc(1.125rem * var(--lumiverse-font-scale,1));--text-lg--line-height:calc(1.75 / 1.125);--font-weight-semibold:600;--font-weight-bold:700;--font-weight-extrabold:800;--font-weight-black:900;--leading-tight:1.25;--leading-relaxed:1.625;--radius-md:var(--lumiverse-radius-md,.375rem);--radius-lg:var(--lumiverse-radius-lg,.5rem);--ease-out:cubic-bezier(0, 0, .2, 1);--animate-spin:ii-am-spin 1s linear infinite;--blur-sm:8px;--blur-2xl:40px;--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1);--text-3xs:calc(.5625rem * var(--lumiverse-font-scale,1));--text-3xs--line-height:.75rem;--text-2xs:calc(.625rem * var(--lumiverse-font-scale,1));--text-2xs--line-height:.75rem;--animate-mobile-workspace-in:ii-am-mobile-workspace-in .24s cubic-bezier(.16, 1, .3, 1);--color-background:var(--lumiverse-bg,#0d0a0c);--color-foreground:var(--lumiverse-text,#f1e5cf);--color-card:var(--lumiverse-card-bg,#1a1619d1);--color-card-foreground:var(--lumiverse-text,#f1e5cf);--color-popover:var(--lumiverse-bg-elevated,#181517f5);--color-popover-foreground:var(--lumiverse-text,#f1e5cf);--color-primary:var(--lumiverse-primary,#d7b86f);--color-primary-foreground:var(--lumiverse-primary-contrast,#231a0d);--color-secondary:var(--lumiverse-fill,#1a1619d1);--color-secondary-foreground:var(--lumiverse-text,#f1e5cf);--color-muted:var(--lumiverse-bg-deep,#151014);--color-muted-foreground:var(--lumiverse-text-muted,#bca98c);--color-accent:var(--lumiverse-fill-hover,#ffffff0b);--color-accent-foreground:var(--lumiverse-text,#f1e5cf);--color-selected:var(--lumiverse-fill-medium,#282427f5);--color-selected-foreground:var(--lumiverse-text,#fff2d5);--color-destructive:var(--lumiverse-danger,#ef7f86);--color-success:var(--lumiverse-success,#7fd391);--color-warning:var(--lumiverse-warning,#e0b85d);--color-border:var(--lumiverse-border,#ffffff0e);--color-input:var(--lumiverse-input-bg,#1a1619d1);--color-ring:var(--lumiverse-primary,#d7b86f);--color-sidebar:var(--lumiverse-bg-panel,#120f11eb);--color-workspace-pane:var(--lumiverse-bg,#0d0a0c);--color-surface-workbench:var(--lumiverse-card-bg,#1a1619d1);--color-surface-workbench-active:var(--lumiverse-fill-strong,#342e32fa);--color-surface-control:var(--lumiverse-input-bg,#1a1619d1);--color-surface-navigation-hover:var(--lumiverse-fill-hover,#ffffff0b);--color-surface-navigation-selected:var(--lumiverse-fill-medium,#282427f5);--color-surface-media-selected:var(--lumiverse-primary-015,#d7b86f29);--color-surface-command:var(--lumiverse-surface-raised,#241f22fa);--color-surface-command-action:var(--lumiverse-fill-strong,#3a3337fa);--color-surface-command-secondary:var(--lumiverse-text-muted,#d9ceba);--color-surface-page-action:var(--lumiverse-fill-medium,#2c262afa);--color-surface-badge:var(--lumiverse-fill,#1a1619d1);--color-surface-prompt-field:var(--lumiverse-bg-deep,#0907087a);--color-surface-lorebook-selected:var(--lumiverse-primary-020,#533a14eb);--color-gender-female:#f48caf;--color-gender-male:#78b8f5;--color-analyzer-key:#7dcfff;--color-analyzer-value:#ffb36b;--color-analyzer-none:#d49aff;--color-prompt-detected:#7de4ff;--color-coordinate-1:#4ea8de;--color-coordinate-2:#ef8354;--color-coordinate-3:#70c1b3;--color-coordinate-4:#b388eb;--color-coordinate-5:#f2c14e;--color-coordinate-6:#e76f9a;--color-coordinate-7:#7cc576;--color-coordinate-8:#e07a5f;--color-toast-surface:var(--lumiverse-bg-elevated,#211d20db);--color-toast-running-soft:#f1e5cf17;--color-toast-running-fill:#f1e5cf1a;--color-toast-running-lead:#f1e5cf29;--color-toast-success-soft:#549e7024;--color-toast-success-fill:#549e7029;--color-toast-success-lead:#549e7038;--color-toast-warning-soft:#c4944824;--color-toast-warning-fill:#c4944829;--color-toast-warning-lead:#c4944838;--color-toast-danger-soft:#ba546629;--color-toast-danger-fill:#ba54662e;--color-toast-danger-lead:#ba54663d;--color-toast-spinner:#fff3dd;--filter-workbench-image:saturate(.76) contrast(1.03)}.ii-am-root :where(:not(svg,svg *,img,video,canvas,iframe)),.ii-am-root :before,.ii-am-root :after{all:revert}.ii-am-root{color-scheme:dark;color:var(--color-foreground);font-family:var(--font-sans);font-size:var(--text-sm);font-synthesis:none;text-rendering:optimizelegibility;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;tab-size:4;text-align:start;letter-spacing:normal;line-height:1.5}.ii-am-root,.ii-am-root *,.ii-am-root :before,.ii-am-root :after,.ii-am-root ::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}.ii-am-root ::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}.ii-am-root *{scrollbar-width:thin;scrollbar-color:var(--color-primary) transparent}@supports (color:color-mix(in lab, red, red)){.ii-am-root *{scrollbar-color:color-mix(in srgb, var(--color-primary) 48%, transparent) transparent}}.ii-am-root :where(h1,h2,h3,h4,h5,h6){font-size:inherit;font-weight:inherit}.ii-am-root :where(a){color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}.ii-am-root :where(b,strong){font-weight:bolder}.ii-am-root :where(code,kbd,samp,pre){font-family:var(--font-mono);font-size:1em}.ii-am-root :where(ol,ul,menu){list-style:none}.ii-am-root :where(img,svg,video,canvas,audio,iframe,embed,object){vertical-align:middle;display:block}.ii-am-root :where(img,video){max-width:100%;height:auto}.ii-am-root :where(button,input,select,optgroup,textarea){font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;box-shadow:none;text-transform:none;background-color:#0000;border-radius:0;outline:none;width:auto;min-width:0;min-height:0}.ii-am-root ::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;box-shadow:none;text-transform:none;background-color:#0000;border-radius:0;outline:none;width:auto;min-width:0;min-height:0}.ii-am-root :where(button,[role=button]){cursor:pointer}.ii-am-root :where(button:disabled,[aria-disabled=true]){cursor:default}.ii-am-root :where(button,input:where([type=button],[type=reset],[type=submit])){appearance:button}.ii-am-root :where(input,textarea)::placeholder{opacity:1;color:currentColor}@supports (color:color-mix(in lab, red, red)){.ii-am-root :where(input,textarea)::placeholder{color:color-mix(in oklab, currentColor 50%, transparent)}}.ii-am-root :where(textarea){resize:vertical}.ii-am-root :where(table){text-indent:0;border-color:inherit;border-collapse:collapse}.ii-am-root :where(hr){height:0;color:inherit;border-top-width:1px}.ii-am-root :where([hidden]:not([hidden=until-found])){display:none!important}.ii-am-root :where(:focus-visible){outline:2px solid var(--color-ring);outline-offset:2px}.ii-am-root.ii-am-overlay{width:var(--app-scaled-viewport-width,100vw);height:var(--app-scaled-viewport-height,100dvh);z-index:9990;background:var(--color-background);padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) calc(env(safe-area-inset-bottom,0px) + var(--ii-am-keyboard-inset,0px)) env(safe-area-inset-left,0px);isolation:isolate;flex-direction:column;display:flex;position:fixed;inset:0;overflow:hidden}.ii-am-root.ii-am-overlay[data-state=closed]{display:none}.ii-am-root .pointer-events-auto{pointer-events:auto}.ii-am-root .pointer-events-none{pointer-events:none}.ii-am-root .invisible{visibility:hidden}.ii-am-root .visible{visibility:visible}.ii-am-root .sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}.ii-am-root .absolute{position:absolute}.ii-am-root .fixed{position:fixed}.ii-am-root .relative{position:relative}.ii-am-root .static{position:static}.ii-am-root .inset-0{inset:0}.ii-am-root .inset-x-0{inset-inline:0}.ii-am-root .inset-y-0{inset-block:0}.ii-am-root .top-1\\/2{top:50%}.ii-am-root .top-3{top:calc(var(--spacing) * 3)}.ii-am-root .right-2{right:calc(var(--spacing) * 2)}.ii-am-root .right-3{right:calc(var(--spacing) * 3)}.ii-am-root .bottom-4{bottom:calc(var(--spacing) * 4)}.ii-am-root .left-0{left:0}.ii-am-root .left-1\\/2{left:50%}.ii-am-root .z-90{z-index:90}.ii-am-root .z-100{z-index:100}.ii-am-root .z-110{z-index:110}.ii-am-root .z-120{z-index:120}.ii-am-root .z-140{z-index:140}.ii-am-root .container{width:100%}@media (min-width:40rem){.ii-am-root .container{max-width:40rem}}@media (min-width:48rem){.ii-am-root .container{max-width:48rem}}@media (min-width:64rem){.ii-am-root .container{max-width:64rem}}@media (min-width:80rem){.ii-am-root .container{max-width:80rem}}@media (min-width:96rem){.ii-am-root .container{max-width:96rem}}.ii-am-root .m-0{margin:0}.ii-am-root .m-3{margin:calc(var(--spacing) * 3)}.ii-am-root .mx-auto{margin-inline:auto}.ii-am-root .mt-0\\.5{margin-top:calc(var(--spacing) * .5)}.ii-am-root .mt-2{margin-top:calc(var(--spacing) * 2)}.ii-am-root .mr-2{margin-right:calc(var(--spacing) * 2)}.ii-am-root .ml-1{margin-left:var(--spacing)}.ii-am-root .block{display:block}.ii-am-root .flex{display:flex}.ii-am-root .grid{display:grid}.ii-am-root .hidden{display:none}.ii-am-root .inline-flex{display:inline-flex}.ii-am-root .size-3\\.5{width:calc(var(--spacing) * 3.5);height:calc(var(--spacing) * 3.5)}.ii-am-root .size-4{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}.ii-am-root .size-5{width:calc(var(--spacing) * 5);height:calc(var(--spacing) * 5)}.ii-am-root .size-6{width:calc(var(--spacing) * 6);height:calc(var(--spacing) * 6)}.ii-am-root .size-8{width:calc(var(--spacing) * 8);height:calc(var(--spacing) * 8)}.ii-am-root .size-8\\.5{width:calc(var(--spacing) * 8.5);height:calc(var(--spacing) * 8.5)}.ii-am-root .size-9\\.5{width:calc(var(--spacing) * 9.5);height:calc(var(--spacing) * 9.5)}.ii-am-root .size-10{width:calc(var(--spacing) * 10);height:calc(var(--spacing) * 10)}.ii-am-root .size-11{width:calc(var(--spacing) * 11);height:calc(var(--spacing) * 11)}.ii-am-root .h-1\\.5{height:calc(var(--spacing) * 1.5)}.ii-am-root .h-5{height:calc(var(--spacing) * 5)}.ii-am-root .h-7{height:calc(var(--spacing) * 7)}.ii-am-root .h-7\\.5{height:calc(var(--spacing) * 7.5)}.ii-am-root .h-8{height:calc(var(--spacing) * 8)}.ii-am-root .h-9{height:calc(var(--spacing) * 9)}.ii-am-root .h-9\\.5{height:calc(var(--spacing) * 9.5)}.ii-am-root .h-12{height:calc(var(--spacing) * 12)}.ii-am-root .h-14{height:calc(var(--spacing) * 14)}.ii-am-root .h-full{height:100%}.ii-am-root .max-h-\\[22rem\\]{max-height:22rem}.ii-am-root .max-h-\\[calc\\(100\\%-32px\\)\\]{max-height:calc(100% - 32px)}.ii-am-root .min-h-0{min-height:0}.ii-am-root .min-h-8{min-height:calc(var(--spacing) * 8)}.ii-am-root .min-h-14{min-height:calc(var(--spacing) * 14)}.ii-am-root .min-h-24{min-height:calc(var(--spacing) * 24)}.ii-am-root .w-9{width:calc(var(--spacing) * 9)}.ii-am-root .w-10{width:calc(var(--spacing) * 10)}.ii-am-root .w-44{width:calc(var(--spacing) * 44)}.ii-am-root .w-56{width:calc(var(--spacing) * 56)}.ii-am-root .w-72{width:calc(var(--spacing) * 72)}.ii-am-root .w-\\[70\\%\\]{width:70%}.ii-am-root .w-\\[min\\(320px\\,86\\%\\)\\]{width:min(320px,86%)}.ii-am-root .w-\\[min\\(420px\\,calc\\(100\\%-32px\\)\\)\\]{width:min(420px,100% - 32px)}.ii-am-root .w-\\[min\\(480px\\,calc\\(100\\%-32px\\)\\)\\]{width:min(480px,100% - 32px)}.ii-am-root .w-full{width:100%}.ii-am-root .max-w-133{max-width:calc(var(--spacing) * 133)}.ii-am-root .max-w-140{max-width:calc(var(--spacing) * 140)}.ii-am-root .max-w-190{max-width:calc(var(--spacing) * 190)}.ii-am-root .min-w-0{min-width:0}.ii-am-root .flex-1{flex:1}.ii-am-root .flex-shrink{flex-shrink:1}.ii-am-root .shrink-0{flex-shrink:0}.ii-am-root .grow{flex-grow:1}.ii-am-root .origin-left{transform-origin:0}.ii-am-root .-translate-x-1\\/2{--tw-translate-x:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.ii-am-root .translate-x-0{--tw-translate-x:0px;translate:var(--tw-translate-x) var(--tw-translate-y)}.ii-am-root .-translate-y-1\\/2{--tw-translate-y:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.ii-am-root .transform{transform:var(--tw-rotate-x,) var(--tw-rotate-y,) var(--tw-rotate-z,) var(--tw-skew-x,) var(--tw-skew-y,)}.ii-am-root .animate-mobile-workspace-in{animation:var(--animate-mobile-workspace-in)}.ii-am-root .animate-spin{animation:var(--animate-spin)}.ii-am-root .cursor-default{cursor:default}.ii-am-root .cursor-pointer{cursor:pointer}.ii-am-root .touch-none{touch-action:none}.ii-am-root .resize{resize:both}.ii-am-root .resize-none{resize:none}.ii-am-root .grid-cols-\\[minmax\\(0\\,1fr\\)_auto\\]{grid-template-columns:minmax(0,1fr) auto}.ii-am-root .flex-col{flex-direction:column}.ii-am-root .place-items-center{place-items:center}.ii-am-root .content-start{align-content:flex-start}.ii-am-root .items-center{align-items:center}.ii-am-root .justify-between{justify-content:space-between}.ii-am-root .justify-center{justify-content:center}.ii-am-root .justify-end{justify-content:flex-end}.ii-am-root .justify-start{justify-content:flex-start}.ii-am-root .gap-0\\.5{gap:calc(var(--spacing) * .5)}.ii-am-root .gap-1{gap:var(--spacing)}.ii-am-root .gap-1\\.5{gap:calc(var(--spacing) * 1.5)}.ii-am-root .gap-2{gap:calc(var(--spacing) * 2)}.ii-am-root .gap-2\\.5{gap:calc(var(--spacing) * 2.5)}.ii-am-root .gap-3{gap:calc(var(--spacing) * 3)}.ii-am-root .gap-4{gap:calc(var(--spacing) * 4)}.ii-am-root .gap-6{gap:calc(var(--spacing) * 6)}.ii-am-root :where(.divide-y>:not(:last-child)){--tw-divide-y-reverse:0;border-bottom-style:var(--tw-border-style);border-top-style:var(--tw-border-style);border-top-width:calc(1px * var(--tw-divide-y-reverse));border-bottom-width:calc(1px * calc(1 - var(--tw-divide-y-reverse)))}.ii-am-root :where(.divide-white\\/5>:not(:last-child)){border-color:#ffffff0d}@supports (color:color-mix(in lab, red, red)){.ii-am-root :where(.divide-white\\/5>:not(:last-child)){border-color:color-mix(in oklab, var(--color-white) 5%, transparent)}}.ii-am-root .truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.ii-am-root .overflow-auto{overflow:auto}.ii-am-root .overflow-hidden{overflow:hidden}.ii-am-root .overflow-x-auto{overflow-x:auto}.ii-am-root .overflow-y-auto{overflow-y:auto}.ii-am-root .rounded-full{border-radius:3.40282e38px}.ii-am-root .rounded-lg{border-radius:var(--radius-lg)}.ii-am-root .rounded-md{border-radius:var(--radius-md)}.ii-am-root .border{border-style:var(--tw-border-style);border-width:1px}.ii-am-root .border-0{border-style:var(--tw-border-style);border-width:0}.ii-am-root .border-2{border-style:var(--tw-border-style);border-width:2px}.ii-am-root .border-r{border-right-style:var(--tw-border-style);border-right-width:1px}.ii-am-root .border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}.ii-am-root .border-border{border-color:var(--color-border)}.ii-am-root .border-toast-spinner{border-color:var(--color-toast-spinner)}.ii-am-root .border-b-transparent{border-bottom-color:#0000}.ii-am-root .bg-black\\/50{background-color:#00000080}@supports (color:color-mix(in lab, red, red)){.ii-am-root .bg-black\\/50{background-color:color-mix(in oklab, var(--color-black) 50%, transparent)}}.ii-am-root .bg-black\\/68{background-color:#000000ad}@supports (color:color-mix(in lab, red, red)){.ii-am-root .bg-black\\/68{background-color:color-mix(in oklab, var(--color-black) 68%, transparent)}}.ii-am-root .bg-card{background-color:var(--color-card)}.ii-am-root .bg-destructive\\/18{background-color:var(--color-destructive)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .bg-destructive\\/18{background-color:color-mix(in oklab, var(--color-destructive) 18%, transparent)}}.ii-am-root .bg-foreground{background-color:var(--color-foreground)}.ii-am-root .bg-input{background-color:var(--color-input)}.ii-am-root .bg-muted-foreground{background-color:var(--color-muted-foreground)}.ii-am-root .bg-popover{background-color:var(--color-popover)}.ii-am-root .bg-primary{background-color:var(--color-primary)}.ii-am-root .bg-secondary{background-color:var(--color-secondary)}.ii-am-root .bg-sidebar{background-color:var(--color-sidebar)}.ii-am-root .bg-surface-command-action{background-color:var(--color-surface-command-action)}.ii-am-root .bg-surface-navigation-selected{background-color:var(--color-surface-navigation-selected)}.ii-am-root .bg-surface-page-action{background-color:var(--color-surface-page-action)}.ii-am-root .bg-toast-surface{background-color:var(--color-toast-surface)}.ii-am-root .bg-transparent{background-color:#0000}.ii-am-root .bg-workspace-pane{background-color:var(--color-workspace-pane)}.ii-am-root .bg-gradient-to-r{--tw-gradient-position:to right in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}.ii-am-root .from-toast-danger-soft{--tw-gradient-from:var(--color-toast-danger-soft);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .from-toast-running-soft{--tw-gradient-from:var(--color-toast-running-soft);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .from-toast-success-soft{--tw-gradient-from:var(--color-toast-success-soft);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .from-toast-warning-soft{--tw-gradient-from:var(--color-toast-warning-soft);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .via-toast-danger-fill{--tw-gradient-via:var(--color-toast-danger-fill);--tw-gradient-via-stops:var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-via) var(--tw-gradient-via-position), var(--tw-gradient-to) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-via-stops)}.ii-am-root .via-toast-running-fill{--tw-gradient-via:var(--color-toast-running-fill);--tw-gradient-via-stops:var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-via) var(--tw-gradient-via-position), var(--tw-gradient-to) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-via-stops)}.ii-am-root .via-toast-success-fill{--tw-gradient-via:var(--color-toast-success-fill);--tw-gradient-via-stops:var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-via) var(--tw-gradient-via-position), var(--tw-gradient-to) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-via-stops)}.ii-am-root .via-toast-warning-fill{--tw-gradient-via:var(--color-toast-warning-fill);--tw-gradient-via-stops:var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-via) var(--tw-gradient-via-position), var(--tw-gradient-to) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-via-stops)}.ii-am-root .to-toast-danger-lead{--tw-gradient-to:var(--color-toast-danger-lead);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .to-toast-running-lead{--tw-gradient-to:var(--color-toast-running-lead);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .to-toast-success-lead{--tw-gradient-to:var(--color-toast-success-lead);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .to-toast-warning-lead{--tw-gradient-to:var(--color-toast-warning-lead);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.ii-am-root .p-0{padding:0}.ii-am-root .p-0\\.5{padding:calc(var(--spacing) * .5)}.ii-am-root .p-1\\.5{padding:calc(var(--spacing) * 1.5)}.ii-am-root .p-2\\.5{padding:calc(var(--spacing) * 2.5)}.ii-am-root .p-3{padding:calc(var(--spacing) * 3)}.ii-am-root .p-4{padding:calc(var(--spacing) * 4)}.ii-am-root .p-5{padding:calc(var(--spacing) * 5)}.ii-am-root .px-0\\.5{padding-inline:calc(var(--spacing) * .5)}.ii-am-root .px-1{padding-inline:var(--spacing)}.ii-am-root .px-2{padding-inline:calc(var(--spacing) * 2)}.ii-am-root .px-2\\.5{padding-inline:calc(var(--spacing) * 2.5)}.ii-am-root .px-3{padding-inline:calc(var(--spacing) * 3)}.ii-am-root .px-4{padding-inline:calc(var(--spacing) * 4)}.ii-am-root .px-5{padding-inline:calc(var(--spacing) * 5)}.ii-am-root .py-1{padding-block:var(--spacing)}.ii-am-root .py-1\\.5{padding-block:calc(var(--spacing) * 1.5)}.ii-am-root .py-2{padding-block:calc(var(--spacing) * 2)}.ii-am-root .py-2\\.5{padding-block:calc(var(--spacing) * 2.5)}.ii-am-root .py-3{padding-block:calc(var(--spacing) * 3)}.ii-am-root .py-5{padding-block:calc(var(--spacing) * 5)}.ii-am-root .pt-2\\.5{padding-top:calc(var(--spacing) * 2.5)}.ii-am-root .pr-1\\.5{padding-right:calc(var(--spacing) * 1.5)}.ii-am-root .pr-4{padding-right:calc(var(--spacing) * 4)}.ii-am-root .pr-8{padding-right:calc(var(--spacing) * 8)}.ii-am-root .pb-4{padding-bottom:calc(var(--spacing) * 4)}.ii-am-root .pb-4\\.5{padding-bottom:calc(var(--spacing) * 4.5)}.ii-am-root .pl-2\\.5{padding-left:calc(var(--spacing) * 2.5)}.ii-am-root .pl-3{padding-left:calc(var(--spacing) * 3)}.ii-am-root .text-left{text-align:left}.ii-am-root .text-right{text-align:right}.ii-am-root .text-2xs{font-size:var(--text-2xs);line-height:var(--tw-leading,var(--text-2xs--line-height))}.ii-am-root .text-3xs{font-size:var(--text-3xs);line-height:var(--tw-leading,var(--text-3xs--line-height))}.ii-am-root .text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}.ii-am-root .text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}.ii-am-root .text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}.ii-am-root .text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.ii-am-root .text-xs\\/3{font-size:var(--text-xs);line-height:calc(var(--spacing) * 3)}.ii-am-root .leading-relaxed{--tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}.ii-am-root .leading-tight{--tw-leading:var(--leading-tight);line-height:var(--leading-tight)}.ii-am-root .font-black{--tw-font-weight:var(--font-weight-black);font-weight:var(--font-weight-black)}.ii-am-root .font-bold{--tw-font-weight:var(--font-weight-bold);font-weight:var(--font-weight-bold)}.ii-am-root .font-extrabold{--tw-font-weight:var(--font-weight-extrabold);font-weight:var(--font-weight-extrabold)}.ii-am-root .font-semibold{--tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}.ii-am-root .wrap-anywhere{overflow-wrap:anywhere}.ii-am-root .whitespace-normal{white-space:normal}.ii-am-root .whitespace-nowrap{white-space:nowrap}.ii-am-root .text-background{color:var(--color-background)}.ii-am-root .text-destructive{color:var(--color-destructive)}.ii-am-root .text-foreground{color:var(--color-foreground)}.ii-am-root .text-muted-foreground{color:var(--color-muted-foreground)}.ii-am-root .text-popover-foreground{color:var(--color-popover-foreground)}.ii-am-root .text-primary{color:var(--color-primary)}.ii-am-root .text-primary-foreground{color:var(--color-primary-foreground)}.ii-am-root .text-secondary-foreground{color:var(--color-secondary-foreground)}.ii-am-root .text-selected-foreground{color:var(--color-selected-foreground)}.ii-am-root .text-success{color:var(--color-success)}.ii-am-root .text-warning{color:var(--color-warning)}.ii-am-root .uppercase{text-transform:uppercase}.ii-am-root .tabular-nums{--tw-numeric-spacing:tabular-nums;font-variant-numeric:var(--tw-ordinal,) var(--tw-slashed-zero,) var(--tw-numeric-figure,) var(--tw-numeric-spacing,) var(--tw-numeric-fraction,)}.ii-am-root .opacity-0{opacity:0}.ii-am-root .opacity-45{opacity:.45}.ii-am-root .shadow-2xl{--tw-shadow:0 25px 50px -12px var(--tw-shadow-color,#00000040);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ii-am-root .shadow-sm{--tw-shadow:0 1px 3px 0 var(--tw-shadow-color,#0000001a), 0 1px 2px -1px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ii-am-root .ring-1{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ii-am-root .ring-2{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ii-am-root .ring-background{--tw-ring-color:var(--color-background)}.ii-am-root .ring-white\\/10{--tw-ring-color:#ffffff1a}@supports (color:color-mix(in lab, red, red)){.ii-am-root .ring-white\\/10{--tw-ring-color:color-mix(in oklab, var(--color-white) 10%, transparent)}}.ii-am-root .outline{outline-style:var(--tw-outline-style);outline-width:1px}.ii-am-root .backdrop-blur-2xl{--tw-backdrop-blur:blur(var(--blur-2xl));-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.ii-am-root .backdrop-blur-\\[18px\\]{--tw-backdrop-blur:blur(18px);-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.ii-am-root .backdrop-blur-sm{--tw-backdrop-blur:blur(var(--blur-sm));-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.ii-am-root .backdrop-filter{-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.ii-am-root .transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ii-am-root .transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ii-am-root .transition-opacity{transition-property:opacity;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ii-am-root .transition-transform{transition-property:transform,translate,scale,rotate;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ii-am-root .duration-150{--tw-duration:.15s;transition-duration:.15s}.ii-am-root .ease-out{--tw-ease:var(--ease-out);transition-timing-function:var(--ease-out)}.ii-am-root .outline-none{--tw-outline-style:none;outline-style:none}.ii-am-root .select-none{-webkit-user-select:none;user-select:none}.ii-am-root .ring-inset{--tw-ring-inset:inset}.ii-am-root .group-data-\\[state\\=checked\\]\\:bg-primary:is(:where(.group)[data-state=checked] *){background-color:var(--color-primary)}.ii-am-root .placeholder\\:text-muted-foreground\\/65::placeholder{color:var(--color-muted-foreground)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .placeholder\\:text-muted-foreground\\/65::placeholder{color:color-mix(in oklab, var(--color-muted-foreground) 65%, transparent)}}@media (hover:hover){.ii-am-root .hover\\:bg-accent:hover{background-color:var(--color-accent)}.ii-am-root .hover\\:bg-destructive\\/28:hover{background-color:var(--color-destructive)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-destructive\\/28:hover{background-color:color-mix(in oklab, var(--color-destructive) 28%, transparent)}}.ii-am-root .hover\\:bg-foreground\\/90:hover{background-color:var(--color-foreground)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-foreground\\/90:hover{background-color:color-mix(in oklab, var(--color-foreground) 90%, transparent)}}.ii-am-root .hover\\:bg-primary\\/90:hover{background-color:var(--color-primary)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-primary\\/90:hover{background-color:color-mix(in oklab, var(--color-primary) 90%, transparent)}}.ii-am-root .hover\\:bg-surface-command-action\\/82:hover{background-color:var(--color-surface-command-action)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-surface-command-action\\/82:hover{background-color:color-mix(in oklab, var(--color-surface-command-action) 82%, transparent)}}.ii-am-root .hover\\:bg-surface-navigation-hover:hover{background-color:var(--color-surface-navigation-hover)}.ii-am-root .hover\\:bg-surface-navigation-selected:hover{background-color:var(--color-surface-navigation-selected)}.ii-am-root .hover\\:bg-surface-page-action\\/82:hover{background-color:var(--color-surface-page-action)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-surface-page-action\\/82:hover{background-color:color-mix(in oklab, var(--color-surface-page-action) 82%, transparent)}}.ii-am-root .hover\\:bg-white\\/8:hover{background-color:#ffffff14}@supports (color:color-mix(in lab, red, red)){.ii-am-root .hover\\:bg-white\\/8:hover{background-color:color-mix(in oklab, var(--color-white) 8%, transparent)}}.ii-am-root .hover\\:text-accent-foreground:hover{color:var(--color-accent-foreground)}.ii-am-root .hover\\:text-foreground:hover{color:var(--color-foreground)}.ii-am-root .hover\\:text-primary:hover{color:var(--color-primary)}}.ii-am-root .focus-visible\\:ring-2:focus-visible{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ii-am-root .focus-visible\\:ring-ring:focus-visible,.ii-am-root .focus-visible\\:ring-ring\\/55:focus-visible{--tw-ring-color:var(--color-ring)}@supports (color:color-mix(in lab, red, red)){.ii-am-root .focus-visible\\:ring-ring\\/55:focus-visible{--tw-ring-color:color-mix(in oklab, var(--color-ring) 55%, transparent)}}.ii-am-root .disabled\\:pointer-events-none:disabled{pointer-events:none}.ii-am-root .disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}.ii-am-root .disabled\\:opacity-45:disabled{opacity:.45}.ii-am-root .data-disabled\\:cursor-not-allowed[data-disabled]{cursor:not-allowed}.ii-am-root .data-disabled\\:opacity-45[data-disabled]{opacity:.45}.ii-am-root .data-\\[disabled\\]\\:pointer-events-none[data-disabled]{pointer-events:none}.ii-am-root .data-\\[disabled\\]\\:opacity-45[data-disabled]{opacity:.45}.ii-am-root .data-\\[highlighted\\]\\:bg-white\\/7[data-highlighted]{background-color:#ffffff12}@supports (color:color-mix(in lab, red, red)){.ii-am-root .data-\\[highlighted\\]\\:bg-white\\/7[data-highlighted]{background-color:color-mix(in oklab, var(--color-white) 7%, transparent)}}.ii-am-root .data-\\[state\\=active\\]\\:bg-selected[data-state=active]{background-color:var(--color-selected)}.ii-am-root .data-\\[state\\=active\\]\\:text-selected-foreground[data-state=active]{color:var(--color-selected-foreground)}.ii-am-root .data-\\[state\\=checked\\]\\:translate-x-4[data-state=checked]{--tw-translate-x:calc(var(--spacing) * 4);translate:var(--tw-translate-x) var(--tw-translate-y)}.ii-am-root .data-\\[state\\=checked\\]\\:bg-primary-foreground[data-state=checked]{background-color:var(--color-primary-foreground)}@media (prefers-reduced-motion:reduce){.ii-am-root .motion-reduce\\:animate-none{animation:none}.ii-am-root .motion-reduce\\:transition-none{transition-property:none}}@media not all and (min-width:48rem){.ii-am-root .max-md\\:size-11{width:calc(var(--spacing) * 11);height:calc(var(--spacing) * 11)}.ii-am-root .max-md\\:h-11{height:calc(var(--spacing) * 11)}.ii-am-root .max-md\\:min-h-11{min-height:calc(var(--spacing) * 11)}.ii-am-root .max-md\\:text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}.ii-am-root .max-md\\:text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}}.ii-am-root .\\[\\&_svg\\]\\:pointer-events-none svg{pointer-events:none}.ii-am-root .\\[\\&_svg\\]\\:size-4 svg{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}.ii-am-root .\\[\\&_svg\\]\\:shrink-0 svg{flex-shrink:0}@keyframes ii-am-mobile-workspace-in{0%{opacity:0;transform:translate(1.5rem)}to{opacity:1;transform:translate(0)}}@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-y{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-z{syntax:"*";inherits:false;initial-value:0}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-divide-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-gradient-position{syntax:"*";inherits:false}@property --tw-gradient-from{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-via{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-to{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-stops{syntax:"*";inherits:false}@property --tw-gradient-via-stops{syntax:"*";inherits:false}@property --tw-gradient-from-position{syntax:"<length-percentage>";inherits:false;initial-value:0%}@property --tw-gradient-via-position{syntax:"<length-percentage>";inherits:false;initial-value:50%}@property --tw-gradient-to-position{syntax:"<length-percentage>";inherits:false;initial-value:100%}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-ordinal{syntax:"*";inherits:false}@property --tw-slashed-zero{syntax:"*";inherits:false}@property --tw-numeric-figure{syntax:"*";inherits:false}@property --tw-numeric-spacing{syntax:"*";inherits:false}@property --tw-numeric-fraction{syntax:"*";inherits:false}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-shadow-color{syntax:"*";inherits:false}@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-shadow-color{syntax:"*";inherits:false}@property --tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-ring-color{syntax:"*";inherits:false}@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-ring-color{syntax:"*";inherits:false}@property --tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-ring-inset{syntax:"*";inherits:false}@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-backdrop-blur{syntax:"*";inherits:false}@property --tw-backdrop-brightness{syntax:"*";inherits:false}@property --tw-backdrop-contrast{syntax:"*";inherits:false}@property --tw-backdrop-grayscale{syntax:"*";inherits:false}@property --tw-backdrop-hue-rotate{syntax:"*";inherits:false}@property --tw-backdrop-invert{syntax:"*";inherits:false}@property --tw-backdrop-opacity{syntax:"*";inherits:false}@property --tw-backdrop-saturate{syntax:"*";inherits:false}@property --tw-backdrop-sepia{syntax:"*";inherits:false}@property --tw-duration{syntax:"*";inherits:false}@property --tw-ease{syntax:"*";inherits:false}@keyframes ii-am-spin{to{transform:rotate(360deg)}}`;

// src/frontend/overlay/styles/index.ts
var OVERLAY_CSS = overlay_generated_default;

// src/frontend.tsx
function setup(ctx) {
  const previousCleanup = globalThis[CLEANUP_KEY];
  if (typeof previousCleanup === "function")
    previousCleanup();
  const store = new FrontendStore;
  const removeStyle = ctx.dom.addStyle(HOST_STYLES);
  const removeOverlayStyle = ctx.dom.addStyle(OVERLAY_CSS);
  const removeLightbox = installInlayLightbox(ctx);
  const gallery = createInlayGallery(ctx);
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  function requestState(chatId = activeChatId()) {
    store.set({ chatId });
    ctx.sendToBackend({ type: "get_state", chatId });
  }
  function patchConfig(patch) {
    store.set({ config: { ...store.get().config, ...patch } });
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
    scheduleInlayDisplayRefresh();
  }
  const overlay = createOverlayController(ctx, {
    store,
    patchConfig,
    onHostFallback: (kind, error) => {
      console.warn(`[Inlay Illustrator] overlay mount fell back to ${kind}:`, error);
    }
  });
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const launcherRoot = document.createElement("div");
  launcherRoot.className = OVERLAY_ROOT_CLASS;
  tab.root.replaceChildren(launcherRoot);
  K(/* @__PURE__ */ u3(LauncherPanel, {
    store,
    onOpen: () => overlay.open()
  }), launcherRoot);
  let inputBarAction = null;
  let removeInputBarClick = null;
  try {
    inputBarAction = ctx.ui.registerInputBarAction({
      id: INPUT_BAR_ACTION_ID,
      label: LAUNCHER_LABELS.inputBarLabel,
      subtitle: LAUNCHER_LABELS.inputBarSubtitle,
      iconSvg: DRAWER_TAB_OPTIONS.iconSvg
    });
    removeInputBarClick = inputBarAction.onClick(() => overlay.open());
  } catch (error) {
    console.warn("[Inlay Illustrator] input-bar action unavailable:", error);
  }
  const removeFab = installInlayFab(ctx, {
    getCorner: () => store.get().config.fabCorner,
    openGallery: () => gallery.open(activeChatId()),
    openSettings: () => overlay.open({ settings: true })
  });
  let inlayDisplayTimer = null;
  function scheduleInlayDisplayRefresh(delayMs = 40) {
    if (inlayDisplayTimer)
      clearTimeout(inlayDisplayTimer);
    inlayDisplayTimer = setTimeout(() => {
      inlayDisplayTimer = null;
      try {
        applyInlayDisplaySettings(store.get().config);
      } catch {}
    }, delayMs);
  }
  const unsub = ctx.onBackendMessage((payload) => {
    const message = payload;
    if (message.type === "avatar_image_request") {
      respondToAvatarImageRequest(message, (response) => ctx.sendToBackend(response));
      return;
    }
    routeBackendMessage(message, activeChatId, {
      replaceConfig: (config) => {
        store.set({ config });
        scheduleInlayDisplayRefresh(0);
      },
      replaceState: (next) => {
        store.set({
          config: next.config,
          parserConnections: next.parserConnections,
          imageConnections: next.imageConnections,
          status: next.status
        });
        scheduleInlayDisplayRefresh(0);
      },
      updateStatus: (status) => store.set({ status }),
      refreshParserConnections: () => {
        fetchParserConnections().then((parserConnections) => {
          if (parserConnections.length > 0)
            store.set({ parserConnections });
        });
      }
    });
    scheduleInlayDisplayRefresh();
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = payload?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
    scheduleInlayDisplayRefresh(80);
  });
  requestState();
  ctx.ready();
  const cleanup = () => {
    unsub();
    unsubChatSwitched();
    if (inlayDisplayTimer)
      clearTimeout(inlayDisplayTimer);
    removeInputBarClick?.();
    inputBarAction?.destroy();
    overlay.destroy();
    removeFab();
    gallery.destroy();
    cleanupModalStyles();
    removeLightbox();
    K(null, launcherRoot);
    removeStyle();
    removeOverlayStyle();
    tab.destroy();
    if (globalThis[CLEANUP_KEY] === cleanup) {
      delete globalThis[CLEANUP_KEY];
    }
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
